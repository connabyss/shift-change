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
    await page.evaluate(() => { const D = window.__dh, st = D.st(), r = D.byId(st.g, st.player.id); D.edit(r.lines.findIndex((l) => l.kind === "lock"), 1); });
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
    await page.evaluate(() => { const D = window.__dh, st = D.st(), r = D.byId(st.g, st.player.id); D.edit(r.lines.findIndex((l) => l.kind === "lock"), 1); });
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
    await page.keyboard.press("Control+z"); assert.equal(await page.evaluate(() => window.__dh.undone()), 1); assert.equal(await voice(), "Undo: the moon.");
    await page.keyboard.press("Meta+z"); assert.equal(await page.evaluate(() => window.__dh.undone()), 2); assert.equal(await voice(), "Undo: gravity.");
    await page.keyboard.press("Control+z"); assert.equal(await page.evaluate(() => window.__dh.undone()), 0); assert.equal(await voice(), "I undid your undo. You're welcome.");
    // hints: the fifth says leave, the seventh draws a door, the rest are real
    const hints = await page.evaluate(() => { const out = []; for (let i = 0; i < 8; i++) { window.__dh.hint(); out.push(window.__dh.st().hint.text); } return { out, crayon: !!window.__dh.st().crayon }; });
    assert.equal(hints.out[4], "Hint: leave.");
    assert.equal(hints.out[6], "Hint: I'm out of hints. Here's a drawing of a door.");
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
