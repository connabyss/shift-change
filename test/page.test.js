// The game in a real (headless) browser: start, point at a word, change it, walk, ask for a hint, mute.
// Needs Playwright with Chromium. Without it these tests are skipped, and say so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

let chromium = null;
try { chromium = createRequire(import.meta.url)("playwright").chromium; } catch { /* not installed */ }
const skip = chromium ? false : "Playwright isn't installed";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function serve() {
  return new Promise((ok) => {
    const s = createServer(async (req, res) => {
      const p = new URL(req.url, "http://x").pathname;
      try {
        const body = await readFile(join(ROOT, p === "/" ? "index.html" : p));
        res.writeHead(200, { "content-type": extname(p) === ".js" ? "text/javascript" : "text/html" }).end(body);
      } catch { res.writeHead(404).end(); }
    }).listen(0, "127.0.0.1", () => ok(s));
  });
}

test("dollhouse: point at a word to preview it, click it to change the house, walk, hint, mute", { skip }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/?seed=4242`);
    await page.waitForFunction(() => window.__dh);
    // canvas pixels -> page pixels (the canvas is drawn at 960x600 and scaled to fit)
    const at = async (x, y) => page.evaluate(([x, y]) => { const r = document.getElementById("game").getBoundingClientRect(); return [r.left + x * r.width / 960, r.top + y * r.height / 600]; }, [x, y]);
    const S = () => page.evaluate(() => { const s = window.__dh.st(); return { scene: s.scene, moves: s.moves, me: s.player.id, walking: !!s.player.way, preview: !!s.preview, hint: s.hint && s.hint.text, anim: !!s.anim }; });

    await page.keyboard.press("Enter");
    assert.equal((await S()).scene, "play");
    await page.waitForTimeout(100);
    // point at the first yellow word: the house shows what it would do
    const wr = await page.evaluate(() => window.__dh.st().wordRects[0]);
    await page.mouse.move(...(await at(wr.x + wr.w / 2, wr.y + wr.h / 2)));
    await page.waitForTimeout(100);
    assert.equal((await S()).preview, true, "pointing at a word previews it");
    // click it: one move, and the house slides
    await page.mouse.click(...(await at(wr.x + wr.w / 2, wr.y + wr.h / 2)));
    let s = await S();
    assert.equal(s.moves, 1); assert.equal(s.anim, true);
    await page.waitForTimeout(900);
    // click another room you can reach: you walk there
    const target = await page.evaluate(() => { const D = window.__dh, st = D.st(); const R = [...D.reach(st.g, st.player.id)].filter((id) => id !== st.player.id); if (!R.length) return null; const p = D.find(st.g, R[0]); return { id: R[0], x: 44 + p.x * 150 + 75, y: 74 + p.y * 146 + 73 }; });
    if (target) {
      await page.mouse.click(...(await at(target.x, target.y)));
      assert.equal((await S()).walking, true, "walking");
      await page.waitForFunction(() => !window.__dh.st().player.way, null, { timeout: 8000 });
      const me = await page.evaluate(() => window.__dh.st().player.id);
      assert.ok(me === target.id || (await page.evaluate(() => window.__dh.st().scene)) !== "play", "arrived (unless it caught you on the way)");
    }
    // stuck: after 20 s the hint shows; clicking it names a room and a word
    await page.evaluate(() => { const st = window.__dh.st(); if (st.scene === "caught") st.caughtT = 99; });
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.__dh.st().floorT = 25; });
    await page.mouse.move(...(await at(5, 5)));
    await page.waitForTimeout(100);
    const hr = await page.evaluate(() => window.__dh.st().hintRect);
    assert.ok(hr, "house.hint() appears");
    await page.mouse.click(...(await at(hr.x + 20, hr.y + 13)));
    assert.match((await S()).hint, /^Hint: /);
    // M mutes and unmutes
    const muted = () => page.evaluate(() => window.__dh.muted());
    const m0 = await muted(); await page.keyboard.press("m"); assert.equal(await muted(), !m0); await page.keyboard.press("m"); assert.equal(await muted(), m0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test("all three floors start, each new word appears in your first room, and the end scene runs", { skip }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__dh);
    for (const [floor, kind] of [[2, "swap"], [3, "flip"]]) {
      await page.evaluate((f) => { window.__dh.newGame(f === 3 ? null : 99, f); window.__dh.begin(); }, floor);
      await page.waitForTimeout(150);
      const kinds = await page.evaluate(() => { const D = window.__dh, st = D.st(); return D.byId(st.g, st.player.id).lines.map((l) => l.kind); });
      assert.ok(kinds.includes(kind), `floor ${floor}: ${kind} in your first room`);
    }
    // the flip, played out: the house turns over in the browser without errors
    await page.evaluate(() => { const D = window.__dh, st = D.st(); D.edit(D.byId(st.g, st.player.id).lines.findIndex((l) => l.kind === "flip"), 1); });
    assert.equal(await page.evaluate(() => window.__dh.st().flipped), true);
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const st = window.__dh.st(); st.scene = "end"; st.endT = 0; });
    await page.waitForTimeout(400);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test("the story: walking into the page's room picks it up, and with all three pages you can change the last word", { skip }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/?seed=4242`);
    await page.waitForFunction(() => window.__dh);
    await page.evaluate(() => window.__dh.begin());
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => window.__dh.st().voice), "the house says something as the floor starts");
    // stand in the page's room: it's picked up
    await page.evaluate(() => { const st = window.__dh.st(); st.player.id = st.page.id; });
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => [window.__dh.st().page.got, window.__dh.st().pages]), [true, 1]);
    // the end with all three pages: click "nobody"
    await page.evaluate(() => { const st = window.__dh.st(); st.pages = 3; st.scene = "end"; st.endT = 5; });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => window.__dh.choiceRects().find((c) => c.word === "nobody"));
    assert.ok(r, "nobody is a word you can click");
    const box = await page.evaluate(() => { const b = document.getElementById("game").getBoundingClientRect(); return [b.left, b.top, b.width / 960, b.height / 600]; });
    await page.mouse.click(box[0] + (r.x + r.w / 2) * box[2], box[1] + (r.y + r.h / 2) * box[3]);
    assert.equal(await page.evaluate(() => window.__dh.st().ending), "free");
    await page.waitForTimeout(400);
    // with fewer pages there's nothing to click, and the house keeps it
    await page.evaluate(() => { window.__dh.newGame(5, 1); const st = window.__dh.st(); st.pages = 2; st.scene = "end"; st.endT = 7.9; });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__dh.choiceRects().length), 0);
    assert.equal(await page.evaluate(() => window.__dh.st().ending), "keep");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test("the house plays back after your move, and the last lock starts the finale: the tab and the file rename themselves", { skip }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__dh);
    await page.evaluate(() => { window.__dh.newGame(99, 2); window.__dh.begin(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const D = window.__dh, st = D.st(), r = D.byId(st.g, st.player.id); D.edit(r.lines.findIndex((l) => l.kind === "row" || l.kind === "swap"), 1); });
    // it writes its move in red first, then makes it
    await page.waitForFunction(() => { const h = window.__dh.st().houseNext; return h && h.move; }, null, { timeout: 4000 });
    const code = await page.evaluate(() => window.__dh.st().houseNext.code);
    assert.match(code, /\.(row|column)\.shift\(|\.swap\(|\.door\./);
    await page.waitForFunction(() => window.__dh.st().total.house >= 1, null, { timeout: 4000 });
    // floor 3: unlocking starts the finale
    await page.evaluate(() => { window.__dh.newGame(null, 3); window.__dh.begin(); const st = window.__dh.st(); st.player.id = st.h.lockIds[0]; });
    await page.waitForTimeout(100);
    await page.evaluate(() => { const D = window.__dh, st = D.st(), r = D.byId(st.g, st.player.id); D.edit(r.lines.findIndex((l) => l.kind === "lock"), 1); st.player.id = st.g[2][0].id; }); // open the lock, then have the front door in reach
    await page.waitForFunction(() => !!window.__dh.st().finale, null, { timeout: 4000 });
    assert.ok(await page.evaluate(() => !!window.__dh.st().finale));
    assert.equal(await page.title(), "you.trapped = true");
    await page.evaluate(() => { window.__dh.st().tear.t = 99; }); // past the screen break (its own test is below)
    // the house slides a row by itself, and there's always a way to the door
    await page.waitForFunction(() => window.__dh.st().finale.n >= 1, null, { timeout: 15000 });
    await page.waitForFunction(() => { const st = window.__dh.st(); return !st.anim && st.finalePath && st.finalePath.length; }, null, { timeout: 6000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

// CH: "A LOT going on" from floor 1. Floor 1 is just you and the house: the shadow sleeps through it, and the only
// words during play are the house's own moves (pages are read between floors).
test("floor 1 is calm: the shadow never wakes, and finding a page doesn't put text in the panel", { skip }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/?seed=4242`);
    await page.waitForFunction(() => window.__dh);
    await page.evaluate(() => window.__dh.begin());
    await page.evaluate(() => { const D = window.__dh, st = D.st(), r = D.byId(st.g, st.player.id); D.edit(r.lines.findIndex((l) => l.kind === "row"), 1); st.sinceStart = 60; });
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => window.__dh.st().shadow.mode), "sleep");
    await page.evaluate(() => { const st = window.__dh.st(); st.player.id = st.page.id; });
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => { const s = window.__dh.st(); return { got: s.page.got, voice: s.voice && s.voice.text }; });
    assert.equal(st.got, true);
    assert.notEqual(st.voice, "That's your handwriting.");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

// The screen break: the last lock opens and the house tears out of its window onto a desktop. While it's out, the
// chase waits; a click skips to the slam; then it says "Then run." and the chase starts.
test("the finale's screen break: the house tears out, the chase waits for it, a click skips it, Shift x5 gets its own box", { skip }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__dh);
    await page.evaluate(() => { window.__dh.newGame(null, 3); window.__dh.begin(); const st = window.__dh.st(); st.player.id = st.h.lockIds[0]; });
    await page.waitForTimeout(100);
    await page.evaluate(() => { const D = window.__dh, st = D.st(), r = D.byId(st.g, st.player.id); D.edit(r.lines.findIndex((l) => l.kind === "lock"), 1); st.player.id = st.g[2][0].id; }); // open the lock, then have the front door in reach
    await page.waitForFunction(() => !!window.__dh.st().finale, null, { timeout: 4000 });
    const S = () => page.evaluate(() => { const s = window.__dh.st(); return { tear: s.tear && s.tear.t, ft: s.finale.t, sh: s.shadow.id + ":" + s.shadow.fx, voice: s.voice && s.voice.text }; });
    let s = await S();
    assert.ok(s.tear !== null && s.tear < 1, "the screen break starts with the finale");
    assert.equal(s.voice, "Did you think I only lived in there?");
    await page.waitForFunction(() => window.__dh.st().tear.t > 2, null, { timeout: 8000 });
    const s2 = await S();
    assert.equal(s2.ft, 0, "the chase waits while the house is out of its window");
    assert.equal(s2.sh, s.sh, "and the shadow waits too");
    assert.equal(await page.title(), "you.js (Not Responding)");
    // a click skips to the slam, and then the chase starts
    const box = await page.evaluate(() => { const b = document.getElementById("game").getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    await page.mouse.click(...box);
    assert.ok((await S()).tear >= 5, "a click skips ahead");
    await page.waitForFunction(() => !window.__dh.st().tear, null, { timeout: 4000 });
    assert.equal((await S()).voice, "Then run.");
    assert.equal(await page.title(), "you.trapped = true");
    await page.waitForFunction(() => window.__dh.st().finale.t > 0, null, { timeout: 4000 }); // the chase is on
    // Shift five times: the house's Sticky Keys box; a click closes it
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift");
    assert.ok(await page.evaluate(() => !!window.__dh.sticky()), "Sticky Keys box");
    await page.mouse.click(...box);
    assert.equal(await page.evaluate(() => window.__dh.sticky()), null);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

async function open(path = "/") {
  const server = await serve(), browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await context.newPage(), errors = [], logs = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => logs.push(m.text()));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url + path); await page.waitForFunction(() => window.__dh);
  const at = async (x, y) => page.evaluate(([x, y]) => { const r = document.getElementById("game").getBoundingClientRect(); return [r.left + x * r.width / 960, r.top + y * r.height / 600]; }, [x, y]);
  const close = async () => { await browser.close(); server.close(); };
  return { page, errors, logs, at, close, url };
}

test("the jokes: Ctrl+Z undoes the moon, then gravity, then your undo; hints 5 and 7; the shadow's note; the console", { skip }, async () => {
  const { page, errors, logs, close } = await open("/?seed=4242");
  try {
    assert.ok(logs.some((l) => l.includes("I can see you reading this.")), "a line for whoever opens the console");
    await page.evaluate(() => window.__dh.begin()); await page.waitForTimeout(100);
    const voice = () => page.evaluate(() => window.__dh.st().voice && window.__dh.st().voice.text);
    const U = () => page.evaluate(() => window.__dh.undone());
    await page.keyboard.press("Control+z"); assert.equal(await U(), 1); assert.equal(await voice(), "Undo: the moon.");
    await page.keyboard.press("Control+z"); assert.equal(await U(), 1, "a quick second press waits: each step holds long enough to see");
    await page.waitForTimeout(2300);
    await page.keyboard.press("Meta+z"); assert.equal(await U(), 2); assert.equal(await voice(), "Undo: gravity. Hold on.");
    await page.waitForTimeout(1500);
    const g = await page.evaluate(() => ({ lift: window.__dh.lift(), junk: window.__dh.junk() }));
    assert.ok(g.lift > 6, `the house floats off the ground (lift ${g.lift})`); assert.ok(g.junk > 0, "loose things drift up");
    await page.waitForTimeout(900);
    await page.keyboard.press("Control+z"); assert.equal(await U(), 0); assert.equal(await voice(), "I undid your undo. You're welcome.");
    assert.ok(await page.evaluate(() => window.__dh.st().shake > 0), "and it lands with a thump");
    await page.waitForTimeout(400); assert.ok(await page.evaluate(() => window.__dh.lift()) < 1, "back on the ground");
    // hints: the fifth says leave, the seventh draws a door, the rest are real
    const hints = await page.evaluate(() => { const out = []; for (let i = 0; i < 8; i++) { window.__dh.hint(); out.push(window.__dh.st().hint.text); } return { out, crayon: !!window.__dh.st().crayon }; });
    assert.match(hints.out[4], /^Hint: leave\. \.\.\.Fine\. (click|walk|the way|a red|even)/, "the joke, then the real hint");
    assert.match(hints.out[6], /^Hint: I'm out of hints\. Here's a drawing of a door\. \.\.\.Fine\. (click|walk|the way|a red|even)/);
    assert.match(hints.out[5], /^Hint: (click|walk|the way|a red|even)/);
    assert.ok(hints.crayon, "the crayon door is drawn");
    // shut the shadow in: it slides a note under the wall, once
    await page.evaluate(() => { const D = window.__dh, st = D.st(); D.newGame(99, 2); D.begin(); });
    await page.waitForTimeout(100);
    const note = await page.evaluate(() => { const st = window.__dh.st(); window.__dh.trapped(true); const a = !!st.note; st.note = null; window.__dh.trapped(true); return [a, !!st.note]; });
    assert.deepEqual(note, [true, false]);
    await page.waitForTimeout(200);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("after the ending: the credits (the shadow edits its line), then the desktop: notes.txt, the Bin, house.js plays again", { skip }, async () => {
  const { page, errors, at, close } = await open("/?seed=4242");
  try {
    await page.evaluate(() => { const st = window.__dh.st(); st.found = [1, 3]; st.pages = 2; st.scene = "end"; st.endT = 9; window.__dh.choose("keep"); st.endT2 = 20; });
    await page.waitForTimeout(100);
    await page.mouse.click(...(await at(480, 300)));
    assert.equal(await page.evaluate(() => window.__dh.st().scene), "credits");
    await page.evaluate(() => { window.__dh.st().credT = 8; }); await page.waitForTimeout(100);
    await page.mouse.click(...(await at(480, 300)));
    assert.equal(await page.evaluate(() => window.__dh.st().scene), "desk");
    assert.equal(await page.title(), "Desktop");
    const icon = async (name) => { const j = ["house.js", "you.js", "notes.txt", "shadow.js", "Bin"].indexOf(name); return at(26 + 25, 22 + j * 82 + 30); };
    assert.equal(await page.evaluate(() => window.__dh.deskHit(51, 22 + 2 * 82 + 30)), "notes.txt");
    await page.mouse.click(...(await icon("notes.txt")));
    assert.equal(await page.evaluate(() => window.__dh.st().desk.open), "notes.txt");
    await page.mouse.click(...(await icon("Bin")));
    await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => window.__dh.st().desk.bin > 0.2), "the Bin spills");
    await page.mouse.click(...(await icon("house.js")));
    assert.equal(await page.evaluate(() => window.__dh.st().scene), "title", "house.js builds a new house");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the house remembers: come back and it says how long you were gone, and the rows of the house you left slide", { skip }, async () => {
  const { page, errors, close, url } = await open("/");
  try {
    assert.equal(await page.evaluate(() => window.__dh.goneFor(3 * 3600e3 + 5 * 60e3)), "3 hours, 5 minutes");
    assert.equal(await page.evaluate(() => window.__dh.goneFor(1000)), "1 second");
    assert.equal(await page.evaluate(() => window.__dh.awayLine()), null, "a reload isn't leaving");
    assert.equal(await page.evaluate(() => window.__dh.goneFor(2 * 86400e3 + 3600e3)), "2 days, 1 hour");
    // you left 2 hours ago (only the time and the house's seed are kept)
    // (set as the next page loads: leaving this one saves a fresh time, as it should)
    await page.addInitScript(() => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.setItem("shift-left", JSON.stringify({ t: Date.now() - 2 * 3600e3 - 60e3, seed: 4242 })); } });
    await page.goto(url + "/"); await page.waitForFunction(() => window.__dh);
    assert.equal(await page.evaluate(() => window.__dh.awayLine()), "You left. I counted: 2 hours, 1 minute.");
    const before = await page.evaluate(() => window.__dh.st().g.map((r) => r.map((c) => c.id).join()));
    await page.waitForFunction(() => window.__dh.st().shuffle.done, null, { timeout: 10000 });
    const after = await page.evaluate(() => window.__dh.st().g.map((r) => r.map((c) => c.id).join()));
    assert.notDeepEqual(after, before, "the rooms shuffled while you were away");
    // starting plays a fresh, solvable house, not the shuffled one
    await page.keyboard.press("Enter");
    const s = await page.evaluate(() => { const st = window.__dh.st(); return { scene: st.scene, decor: !!st.decor, line: window.__dh.awayLine() }; });
    assert.deepEqual(s, { scene: "play", decor: false, line: null });
    // leaving saves the time again
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.evaluate(() => dispatchEvent(new Event("pagehide")));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("shift-left")));
    assert.deepEqual(Object.keys(saved).sort(), ["seed", "t"], "only a time and a seed");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("holding Shift slides the house over a room and snaps back; the puzzle doesn't change and clicks wait", { skip }, async () => {
  const { page, errors, at, close } = await open("/?seed=4242");
  try {
    await page.evaluate(() => window.__dh.begin()); await page.waitForTimeout(100);
    const grid = () => page.evaluate(() => JSON.stringify(window.__dh.st().g));
    const g0 = await grid();
    await page.keyboard.down("Shift");
    await page.waitForFunction(() => window.__dh.shiftK() >= 1, null, { timeout: 4000 });
    assert.equal(await grid(), g0, "only the drawing moves");
    const wr = await page.evaluate(() => window.__dh.st().wordRects[0]);
    await page.mouse.click(...(await at(wr.x + wr.w / 2, wr.y + wr.h / 2)));
    assert.equal(await page.evaluate(() => window.__dh.st().moves), 0, "clicks wait while it's held over");
    assert.ok(["Put me down.", "That tickles.", "I'm load-bearing, you know.", "Shift happens."].includes(await page.evaluate(() => window.__dh.st().voice.text)));
    await page.keyboard.up("Shift");
    await page.waitForFunction(() => window.__dh.shiftK() === 0, null, { timeout: 4000 });
    assert.equal(await grid(), g0);
    // a quick tap (like Sticky Keys presses) doesn't slide it
    await page.keyboard.press("Shift"); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__dh.shiftK()), 0);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("on touch, the first tap on a word previews it and the second changes it", { skip }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 600 }, hasTouch: true });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/?seed=4242`);
    await page.waitForFunction(() => window.__dh);
    await page.evaluate(() => window.__dh.begin()); await page.waitForTimeout(100);
    const wr = await page.evaluate(() => window.__dh.st().wordRects[0]);
    const xy = await page.evaluate(([x, y]) => { const r = document.getElementById("game").getBoundingClientRect(); return [r.left + x * r.width / 960, r.top + y * r.height / 600]; }, [wr.x + wr.w / 2, wr.y + wr.h / 2]);
    await page.touchscreen.tap(...xy);
    let s = await page.evaluate(() => ({ moves: window.__dh.st().moves, preview: !!window.__dh.st().preview }));
    assert.deepEqual(s, { moves: 0, preview: true }, "first tap previews");
    await page.touchscreen.tap(...xy);
    assert.equal(await page.evaluate(() => window.__dh.st().moves), 1, "second tap changes it");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test("the house speaks one line at a time: a new line waits its turn, and each stays up long enough to read", { skip }, async () => {
  const { page, errors, close } = await open("/?seed=4242");
  try {
    await page.evaluate(() => { window.__dh.begin(); window.__dh.hush(); window.__dh.line("Achoo. ...Sorry. Dust."); window.__dh.line("Psst. The yellow words. Click one. I never said that."); });
    const v = () => page.evaluate(() => { const x = window.__dh.st().voice; return x && { text: x.text, len: x.len }; });
    const first = await v();
    assert.equal(first.text, "Achoo. ...Sorry. Dust.", "the second line didn't cut off the first");
    assert.ok(first.len >= 4, "at least four seconds on screen");
    await page.evaluate(() => { window.__dh.st().voice.t = 99; });
    await page.waitForFunction(() => { const x = window.__dh.st().voice; return x && x.text.startsWith("Psst"); }, null, { timeout: 4000 });
    assert.ok((await v()).len > first.len, "a longer line stays up longer");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("one absurd thing per floor early on, and floor 1 nudges you if you sit still", { skip }, async () => {
  const { page, errors, close } = await open("/?seed=4242");
  try {
    const G = () => page.evaluate(() => window.__dh.gag());
    const voice = () => page.evaluate(() => window.__dh.st().voice && window.__dh.st().voice.text);
    await page.evaluate(() => window.__dh.begin());
    // a joke never lands on top of another line: with the house still talking, the sneeze waits
    await page.evaluate(() => { const st = window.__dh.st(); window.__dh.hush(); window.__dh.line("You come back. You always come back."); st.sinceStart = 12.5; }); await page.waitForTimeout(150);
    assert.equal((await G()).gag, false, "no sneeze while a line is up");
    await page.evaluate(() => { window.__dh.hush(); window.__dh.st().sinceStart = 12.5; }); await page.waitForTimeout(150);
    assert.equal((await G()).gag, true); assert.equal(await voice(), "Achoo. ...Sorry. Dust.");
    await page.evaluate(() => { window.__dh.hush(); window.__dh.st().sinceStart = 31; }); await page.waitForTimeout(150);
    assert.equal((await G()).nudged, true); assert.equal(await voice(), "Psst. The yellow words. Click one. I never said that.");
    assert.match(await page.evaluate(() => window.__dh.st().hint.text), /^Hint: /, "and the hint frames the word to click");
    assert.equal(await page.evaluate(() => window.__dh.st().total.hints), 0, "the nudge isn't counted as a hint you asked for");
    // floor 2: the shadow wakes and holds up a sign
    await page.evaluate(() => { window.__dh.newGame(99, 2); window.__dh.begin(); const st = window.__dh.st(); window.__dh.edit(window.__dh.byId(st.g, st.player.id).lines.findIndex((l) => l.kind === "row" || l.kind === "swap"), 1); st.sinceStart = 9; window.__dh.hush(); });
    // it waits for the shadow's wake-up line to finish first
    await page.waitForFunction(() => window.__dh.gag().sign, null, { timeout: 12000 });
    // floor 3: your first flip gets the sticker
    await page.evaluate(() => { window.__dh.newGame(null, 3); window.__dh.begin(); const D = window.__dh, st = D.st(); D.edit(D.byId(st.g, st.player.id).lines.findIndex((l) => l.kind === "flip"), 1); });
    assert.equal((await G()).sticker, true);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the house never hands you the exit: its moves don't shorten your way out or let you skip the floor's new word", { skip }, async () => {
  const { page, errors, close } = await open("/?seed=4242");
  try {
    const bad = await page.evaluate(() => {
      const D = window.__dh, out = [];
      for (const [floor, seeds] of [[2, [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]], [3, [null]]]) for (const seed of seeds) {
        D.newGame(seed, floor); D.begin(); const st = D.st(); st.shadow.mode = "hunt";
        const nw = floor === 2 ? "swap" : "flip";
        // try each of your own first moves, then see what the house would answer with
        const first = D.edits(D.byId(st.g, st.player.id));
        const g0 = D.clone(st.g);
        for (const [li, dir] of first) {
          st.g = D.clone(g0); D.applyEdit(st.g, st.player.id, li, null, dir);
          const base = D.solve(st.g, st.player.id, st.h.lockIds, false, 3), need = base ? base.length : 4;
          const m = D.pickHouseMove(); if (!m) continue;
          const p = D.solve(m.g, st.player.id, st.h.lockIds, false, 3);
          if (!p || p.length < need) out.push({ floor, seed, li, dir, need, got: p && p.length });
          else if (base && need > 0 && !D.solve(st.g, st.player.id, st.h.lockIds, false, need, nw) && D.solve(m.g, st.player.id, st.h.lockIds, false, p.length, nw)) out.push({ floor, seed, li, dir, skip: nw });
        }
      }
      return out;
    });
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("floor 1 keeps nudging a lost player, and a hint follows the house's moves", { skip }, async () => {
  const { page, errors, close } = await open("/?seed=4242");
  try {
    await page.evaluate(() => window.__dh.begin()); await page.waitForTimeout(150);
    await page.evaluate(() => { const st = window.__dh.st(); st.moves = st.h.par + 4; st.sinceStart = 11; st.gag = true; window.__dh.hush(); });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__dh.st().nudge.n), 1, "clicking around but lost still gets a nudge");
    await page.evaluate(() => { window.__dh.hush(); window.__dh.st().sinceStart += 26; }); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__dh.st().nudge.n), 2, "and again later");
    assert.equal(await page.evaluate(() => window.__dh.st().voice.text), "Still lost? That one. The yellow frame. I'm not helping.");
    // ask for a hint, then the house makes a move that cuts you off from the room it named: the hint follows
    const r = await page.evaluate(() => {
      const D = window.__dh;
      for (const seed of [99, 1, 2, 3, 5, 7, 11, 13]) {
        D.newGame(seed, 1); D.begin(); const st = D.st(); D.hint(); const h = st.hint;
        if (!h || h.id == null || h.id === st.player.id) continue;
        const m = D.houseMoves(st.g, st.player.id, st.shadow.id, false).find((m) => !D.reach(m.g, st.player.id).has(h.id));
        if (!m) continue;
        D.houseMove(m); st.anim = null;
        return { tried: true, ok: st.hint.id == null || D.reach(st.g, st.player.id).has(st.hint.id) };
      }
      return { tried: false };
    });
    assert.ok(r.tried, "found a house move that cuts the hinted room off");
    const ok = r.ok;
    assert.ok(ok, "the hint points somewhere you can go");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

// CH's picks: floor 1 is calm (no counter-moves), the last floor's chase starts only once the door is in reach (so
// its own puzzle still counts), and the chase lets you go after about half a minute, with no drag back to the start.
test("floor 1 has no counter-moves; floor 3's lock waits for the door; the chase is short and never drags you back", { skip }, async () => {
  const { page, errors, close } = await open("/?seed=4242");
  try {
    await page.evaluate(() => { const D = window.__dh; D.begin(); const st = D.st(); st.gag = true; D.edit(D.byId(st.g, st.player.id).lines.findIndex((l) => l.kind === "row"), 1); });
    await page.waitForTimeout(3500);
    assert.equal(await page.evaluate(() => window.__dh.st().houseNext || window.__dh.st().total.house || 0), 0, "floor 1: the house doesn't answer");
    // floor 3: open a lock where the door isn't in reach: no finale yet
    const r = await page.evaluate(() => {
      const D = window.__dh;
      for (let i = 0; i < 30; i++) {
        D.newGame(null, 3); D.begin(); const st = D.st(); st.gag = true;
        for (const l of st.h.lockIds) { st.player.id = l; if (D.reach(st.g, l).has(st.g[2][0].id)) continue;
          D.edit(D.byId(st.g, l).lines.findIndex((x) => x.kind === "lock"), 1); return { found: true }; }
      }
      return { found: false };
    });
    assert.ok(r.found, "a floor-3 lock without the door in reach");
    await page.waitForTimeout(400);
    assert.deepEqual(await page.evaluate(() => [window.__dh.st().unlocked, !!window.__dh.st().finale]), [true, false], "unlocked, but no chase yet");
    // bring the door into reach: the chase starts
    await page.evaluate(() => { const st = window.__dh.st(); st.player.id = st.g[2][0].id; });
    await page.waitForFunction(() => !!window.__dh.st().finale, null, { timeout: 4000 });
    await page.evaluate(() => { window.__dh.st().tear.t = 99; });
    await page.waitForFunction(() => !window.__dh.st().tear, null, { timeout: 4000 });
    assert.ok(await page.evaluate(() => { const st = window.__dh.st(); return !!window.__dh.path(st.g, st.shadow.id, st.player.id); }), "the chase starts with the shadow able to reach you");
    // caught in the chase: you stay put, it's flung away
    await page.waitForFunction(() => !window.__dh.st().anim, null, { timeout: 4000 }); // the house finishes turning over
    const c = await page.evaluate(() => { const st = window.__dh.st(); const me = st.player.id; st.player.way = null; st.shadow.id = me; st.shadow.fx = st.player.fx; st.shadow.way = null; return me; });
    await page.waitForFunction((me) => window.__dh.st().shadow.id !== me || window.__dh.st().scene !== "play", c, { timeout: 4000 });
    const after = await page.evaluate(() => { const st = window.__dh.st(); return { scene: st.scene, me: st.player.id, sh: st.shadow.id }; });
    assert.equal(after.scene, "play", "no drag back");
    assert.equal(after.me, c); assert.notEqual(after.sh, c);
    // the front door holds shut while it's still chasing
    await page.evaluate(() => { const st = window.__dh.st(); st.player.id = st.g[2][0].id; st.player.way = null; st.shadow.timer = 99; st.shadow.way = null; window.__dh.walk(st.g[2][0].id, true); });
    await page.waitForFunction(() => !window.__dh.st().player.way, null, { timeout: 4000 });
    assert.equal(await page.evaluate(() => window.__dh.st().scene), "play", "the door won't open yet");
    assert.ok(await page.evaluate(() => window.__dh.st().player.fx >= 0), "pushed back inside, not left on the doorstep");
    assert.ok(await page.evaluate(() => window.__dh.st().floats.some((f) => f.text.includes("not yet"))), "the door says not yet");
    // a second try right away doesn't stack a second label
    await page.evaluate(() => { const st = window.__dh.st(); window.__dh.walk(st.g[2][0].id, true); });
    await page.waitForFunction(() => !window.__dh.st().player.way, null, { timeout: 4000 });
    assert.equal(await page.evaluate(() => window.__dh.st().floats.filter((f) => f.text.includes("not yet")).length), 1);
    // until it gives up, what's lit is where you can run, not a way to the door
    assert.ok(await page.evaluate(() => { const D = window.__dh, st = D.st(); const R = [...D.reach(st.g, st.player.id)].sort().join(); return [...st.finalePath].sort().join() === R; }));
    // and about half a minute in, it gives up and stops sliding
    await page.evaluate(() => { window.__dh.st().finale.t = 31; });
    await page.waitForFunction(() => window.__dh.st().finale.giveUp, null, { timeout: 4000 });
    assert.equal(await page.evaluate(() => window.__dh.st().voice.text), "Fine. Go. I'll keep the light on.");
    assert.ok(await page.evaluate(() => { const st = window.__dh.st(); return !!window.__dh.path(st.g, st.player.id, st.g[2][0].id); }), "a way to the door is open");
    // now the door opens
    await page.evaluate(() => { const st = window.__dh.st(); st.shadow.timer = 99; st.shadow.way = null; window.__dh.walk(st.g[2][0].id, true); });
    await page.waitForFunction(() => window.__dh.st().scene === "end", null, { timeout: 8000 });
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

// The critic's pass (11-04): a chase you can follow, no cheap grabs, words that never scramble, no dead floor,
// and the dark rooms still show their doorways and names.
test("the chase: a slide about every 4 s, and each line said once, six at most", { skip }, async () => {
  const { page, errors, close } = await open("/");
  try {
    for (let run = 0; run < 4; run++) {
    const r = await page.evaluate(() => {
      const D = window.__dh; D.newGame(null, 3); D.begin(); const st = D.st(); st.gag = true; st.faced = true; st.floorT = 9; st.player.id = st.h.lockIds[0];
      D.edit(D.byId(st.g, st.player.id).lines.findIndex((l) => l.kind === "lock"), 1); st.player.id = st.g[2][0].id; st.anim = null;
      D.tick(0.05, 2); if (!st.finale) return { started: false };
      st.tear.t = 99; D.tick(0.05, 1);
      // you keep trying the front door the whole time (it says "not yet")
      const said = [], at = [], shown = []; let v = null, a = null;
      for (let i = 0; i < 800 && !st.finale.giveUp; i++) {
        if (!st.player.way && !st.anim) D.walk(st.g[2][0].id, true);
        D.tick(0.05, 1); if (st.voice && st.voice !== v) { if (v) shown.push(v.t); v = st.voice; said.push(v.text); } if (st.anim && st.anim !== a) { a = st.anim; if (a.kind === "row") at.push(st.finale.t); }
      }
      const gaps = at.slice(1).map((t, i) => t - at[i]);
      return { started: true, said, slides: at.length, gap: Math.min(...gaps), giveUp: !!st.finale.giveUp, shortest: Math.min(99, ...shown) };
    });
    assert.ok(r.started, "the finale started");
    assert.ok(r.giveUp, "and it lets you go");
    assert.ok(r.gap >= 3.9, `slides at least ~4 s apart (closest ${r.gap.toFixed(2)} s)`);
    assert.ok(r.slides >= 5, `slides ${r.slides}: it still chases`);
    const dupes = r.said.filter((t, i) => r.said.indexOf(t) !== i);
    assert.deepEqual(dupes, [], `no line twice: ${r.said.join(" | ")}`);
    assert.ok(r.said.length <= 6, `at most six lines in the chase: ${r.said.join(" | ")}`);
    assert.ok(r.said.filter((t) => t.startsWith("Not yet")).length <= 1, "it says \"not yet\" once");
    assert.ok(r.shortest >= 2.5, `each line stays up to be read (shortest ${r.shortest.toFixed(2)} s)`);
    }
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("no cheap grabs: the house never slides the shadow right up next to you", { skip }, async () => {
  const { page, errors, close } = await open("/");
  try {
    const bad = await page.evaluate(() => {
      const D = window.__dh, out = []; let tried = 0;
      for (let seed = 1; seed < 40; seed++) for (let mix = 0; mix < 6; mix++) {
        D.newGame(seed, 2); D.begin(); const st = D.st(); st.shadow.mode = "hunt";
        // a few of your own words first, so the house is in all sorts of states
        for (let e = 0; e < mix; e++) { const room = D.byId(st.g, st.player.id), es = D.edits(room); if (!es.length) break; const [li, d] = es[(e * 7 + seed) % es.length]; D.applyEdit(st.g, room.id, li, null, d); }
        // the shadow two rooms or more away, in each room it could be
        for (const row of st.g) for (const room of row) {
          if (room.id === st.player.id) continue; st.shadow.id = room.id;
          const before = D.path(st.g, st.shadow.id, st.player.id), b = before ? before.length - 1 : 9; if (b < 2) continue;
          const m = D.pickHouseMove(); if (!m) continue; tried++; const p = D.path(m.g, st.shadow.id, st.player.id), a = p ? p.length - 1 : 9; if (a <= 1) out.push(seed);
        }
      }
      return { out, tried };
    });
    assert.ok(bad.tried > 500, "picked plenty of house moves");
    assert.deepEqual(bad.out, []);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the yellow words you click never scramble when the house glitches", { skip }, async () => {
  const { page, errors, close } = await open("/?seed=4242");
  try {
    await page.evaluate(() => { window.__dh.begin(); const st = window.__dh.st(); st.floorT = 9; st.gag = true; window.__dh.hush(); });
    await page.mouse.move(5, 5); await page.waitForTimeout(200);
    // record every string drawn while the glitch is at full strength
    const drawn = await page.evaluate(async () => {
      const P = CanvasRenderingContext2D.prototype, orig = P.fillText, out = [];
      window.__dh.st().glitch = 999; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      P.fillText = function (t, ...a) { out.push(String(t)); return orig.call(this, t, ...a); };
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      P.fillText = orig; return out;
    });
    const room = await page.evaluate(() => { const st = window.__dh.st(); return st.g.flat().find((r) => r.id === st.player.id).lines.map((l) => l.kind); });
    assert.ok(room.includes("row"), "this room has a row line");
    assert.ok(drawn.includes("west") && drawn.includes("east"), `the words come out as written (${drawn.filter((t) => t.length < 8).slice(0, 12).join(",")})`);
    assert.ok(await page.evaluate(() => window.__dh.st().glitch > 100), "and the glitch was on the whole time");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("never a dead floor: after a grab, if no way out is left, the house puts the floor back", { skip }, async () => {
  const { page, errors, close } = await open("/?seed=4242");
  try {
    const r = await page.evaluate(() => {
      const D = window.__dh; D.newGame(99, 2); D.begin(); const st = D.st();
      for (const row of st.g) for (const room of row) { room.l = room.r = room.up = room.down = false; room.lines = room.lines.filter((l) => l.kind === "lock"); }
      const dead = !D.solve(st.g, st.h.startId, st.h.lockIds, false, 4);
      D.dragBack();
      return { dead, ok: !!D.solve(st.g, st.player.id, st.h.lockIds, false, 4) };
    });
    assert.ok(r.dead, "the test floor really had no way out");
    assert.ok(r.ok, "after the grab there is a way out again");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("in the dark, rooms still show their walls and names, and pointing at a word lights the rooms it moves", { skip }, async () => {
  const { page, errors, close } = await open("/?seed=4242");
  try {
    await page.evaluate(() => { const D = window.__dh; D.newGame(99, 2); D.begin(); const st = D.st(); st.floorT = 9; st.gag = true; D.hush(); });
    await page.mouse.move(5, 5); await page.waitForTimeout(300);
    // a dark room far from you and out of reach: its bottom wall is drawn in chalk blue
    const px = await page.evaluate(() => {
      const D = window.__dh, st = D.st(), me = D.find(st.g, st.player.id), R = D.reach(st.g, st.player.id);
      let best = null; for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) { const r = st.g[y][x]; if (R.has(r.id) || Math.abs(x - me.x) + Math.abs(y - me.y) < 2) continue; best = { x, y }; }
      const cv = document.getElementById("game"), c = cv.getContext("2d"), k = cv.width / 960;
      // the house's box: rooms 150 x 146 from (44, 74) (HX, HY, CW, CH in src/app.js)
      const X = Math.round((44 + best.x * 150 + 75) * k), Y = Math.round((74 + best.y * 146 + 146 - 10) * k), A = Math.round((74 + best.y * 146 + 80) * k);
      const at = (x, y) => [...c.getImageData(x, y, 1, 1).data];
      return { wall: at(X, Y), inside: at(X, A) };
    });
    assert.ok(px.wall[2] > px.inside[2] + 25, `the wall line shows (${px.wall} vs ${px.inside})`);
    const wr = await page.evaluate(() => window.__dh.st().wordRects[0]);
    await page.mouse.move(wr.x + wr.w / 2, wr.y + wr.h / 2); await page.waitForTimeout(200);
    const lit = await page.evaluate(() => window.__dh.previewLit().length);
    assert.ok(lit >= 3, `the rooms the word moves light up (${lit})`);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

// Critic round 2 (11-05): phones held upright, colour-blind players, doorways at a glance, the tear's frame cost
test("a phone held upright gets the house's \"I'm wider than this.\" card, and the game waits until it's turned", { skip }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ ...createRequire(import.meta.url)("playwright").devices["iPhone 13"] });
    const page = await ctx.newPage(), errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/?seed=4242`); await page.waitForFunction(() => window.__dh);
    const look = () => page.evaluate(() => ({ card: getComputedStyle(document.getElementById("turn")).display, canvas: getComputedStyle(document.getElementById("game")).display, t: window.__dh.st().t, up: window.__dh.upright() }));
    const a = await look(); await page.waitForTimeout(400); const b = await look();
    assert.equal(a.card, "flex"); assert.equal(a.canvas, "none"); assert.ok(a.up);
    assert.equal(b.t, a.t, "the house waits");
    assert.match(await page.textContent("#turn"), /I'm wider than this\./);
    await page.setViewportSize({ width: 664, height: 390 }); await page.waitForTimeout(400);
    const c = await look();
    assert.equal(c.card, "none"); assert.equal(c.canvas, "block"); assert.ok(c.t > b.t, "turned sideways, it plays");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test("a lock in reach in the preview is tagged in words, not only in red", { skip }, async () => {
  const { page, errors, close } = await open("/?seed=4242");
  try {
    await page.evaluate(() => { const D = window.__dh; D.newGame(99, 2); D.begin(); D.st().floorT = 9; D.hush(); });
    await page.mouse.move(5, 5); await page.waitForTimeout(300);
    const hit = await page.evaluate(() => { const D = window.__dh, st = D.st(), room = D.byId(st.g, st.player.id); for (const r of st.wordRects) { const g2 = D.clone(st.g); D.applyEdit(g2, room.id, r.li, null, r.dir); if (st.h.lockIds.some((l) => D.reach(g2, room.id).has(l))) return r; } return null; });
    assert.ok(hit, "a word on this floor brings a lock into reach");
    await page.mouse.move(hit.x + hit.w / 2, hit.y + hit.h / 2); await page.waitForTimeout(200);
    const drawn = await page.evaluate(async () => {
      const P = CanvasRenderingContext2D.prototype, orig = P.fillText, out = [];
      P.fillText = function (t, ...a) { out.push(String(t)); return orig.call(this, t, ...a); };
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); P.fillText = orig; return out;
    });
    assert.ok(drawn.includes("lock in reach"));
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("in the dark, an open doorway has a bright threshold you can spot at a glance", { skip }, async () => {
  const { page, errors, close } = await open("/?seed=4242");
  try {
    await page.evaluate(() => { const D = window.__dh; D.newGame(99, 2); D.begin(); const st = D.st(); st.floorT = 9; D.hush(); });
    await page.mouse.move(5, 5); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const D = window.__dh, st = D.st(), me = D.find(st.g, st.player.id), R = D.reach(st.g, st.player.id);
      let best = null; for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) { const room = st.g[y][x]; if (!room.l || R.has(room.id) || Math.abs(x - me.x) + Math.abs(y - me.y) < 2) continue; best = { x, y }; }
      if (!best) return null;
      const cv = document.getElementById("game"), c = cv.getContext("2d"), k = cv.width / 960, at = (x, y) => [...c.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data];
      const cx = 44 + best.x * 150, bot = 74 + best.y * 146 + 146 - 10; // HX, HY, CW, CH in src/app.js; the chalk floor line
      return { door: at(cx + 12 + 8, bot), floor: at(cx + 75, bot) };
    });
    assert.ok(r, "a dark room with an open west doorway");
    assert.ok(r.door[2] > r.floor[2] + 30, `the threshold is brighter than the floor line (${r.door} vs ${r.floor})`);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the screen break draws the game once, not every frame, so the WOW moment stays smooth", { skip }, async () => {
  const { page, errors, close } = await open("/");
  try {
    const r = await page.evaluate(() => {
      const D = window.__dh; D.newGame(null, 3); D.begin(); const st = D.st(); st.gag = true; st.faced = true; st.floorT = 9;
      const time = (n) => { const a = performance.now(); for (let i = 0; i < n; i++) D.render(); return (performance.now() - a) / n; };
      time(3); const play = time(12);
      st.player.id = st.h.lockIds[0]; D.edit(D.byId(st.g, st.player.id).lines.findIndex((l) => l.kind === "lock"), 1); st.player.id = st.g[2][0].id; st.anim = null; D.tick(0.05, 2);
      if (!st.tear) return null; st.tear.t = 3; D.render(); return { play, tear: time(12) };
    });
    assert.ok(r, "the tear started");
    assert.ok(r.tear < r.play * 0.7, `a tear frame (${r.tear.toFixed(1)} ms) costs well under a play frame (${r.play.toFixed(1)} ms)`);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});
