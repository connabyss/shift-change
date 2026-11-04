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
