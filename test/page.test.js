// The game in a real (headless) browser: go inside, walk, turn, shove your row, hide in the wardrobe.
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

test("first person: walk, turn, shove your row and ride along, hide in the wardrobe", { skip }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__fp);
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => window.__fp.scene()), "play");
    const me = () => page.evaluate(() => ({ ...window.__fp.me() }));
    const a0 = await me();
    await page.keyboard.down("w"); await page.waitForTimeout(300); await page.keyboard.up("w");
    const a1 = await me();
    assert.ok(a1.y < a0.y, "walked forward (north)");
    // with the mouse (pointer locked), D steps sideways to your right; without it, D turns you right
    const locked = await page.evaluate(() => document.pointerLockElement !== null);
    await page.keyboard.down("d"); await page.waitForTimeout(300); await page.keyboard.up("d");
    const a2 = await me();
    if (locked) { assert.ok(a2.x > a1.x, "stepped right (east)"); assert.equal(a2.a, a1.a); }
    else assert.ok(a2.a > a1.a, "turned right");
    // on floor 1 the shadow sleeps at first: a head start
    const sh0 = await page.evaluate(() => ({ ...window.__fp.shadow() }));
    assert.equal(await page.evaluate(() => window.__fp.awake()), false, "asleep at the start of floor 1");
    // face north again, hold Q and tap D: nothing moves yet, you don't walk, the map shows the plan.
    // Let go of Q: your row slides east (to your right), you ride along
    await page.evaluate(() => { window.__fp.me().a = -Math.PI / 2; });
    const before = await me();
    await page.keyboard.down("q");
    await page.keyboard.down("d"); await page.waitForTimeout(250); await page.keyboard.up("d");
    assert.equal(await page.evaluate(() => window.__fp.planning()), true);
    assert.equal(await page.evaluate(() => window.__fp.aim()), "ArrowRight");
    assert.equal(await page.evaluate(() => window.__fp.house().shoves), 0, "planning only shows what will slide");
    assert.equal((await me()).x, before.x, "D picks a direction while planning; it doesn't walk you");
    const sh1 = await page.evaluate(() => ({ ...window.__fp.shadow() }));
    assert.deepEqual([sh1.x, sh1.y], [sh0.x, sh0.y], "the sleeping shadow hasn't moved");
    await page.keyboard.up("q");
    await page.waitForTimeout(700);
    const after = await me();
    assert.equal(await page.evaluate(() => window.__fp.house().shoves), 1);
    assert.equal(after.a, before.a, "sliding never turns you");
    // holding Q and letting go without picking a way does nothing
    await page.keyboard.down("q"); await page.keyboard.up("q"); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__fp.house().shoves), 1);
    assert.ok(Math.abs(Math.abs(after.x - before.x) - 5) < 0.01 || Math.abs(after.x - before.x) > 10, "rode along one room (or wrapped round)");
    // stand next to a wardrobe, facing it, and hide in it (with the shadow sent off to wait in a far corner)
    await page.evaluate(() => {
      const sh = window.__fp.shadow(); Object.assign(sh, { x: 0.5, y: 0.5, mode: "look", timer: 99, target: null });
      const map = window.__fp.map(), m = window.__fp.me();
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.kind[y][x] === 3) { m.x = x + 1.5; m.y = y + 1.5; m.a = Math.atan2(-1, -1); return; }
    });
    await page.keyboard.press("e");
    assert.equal(await page.evaluate(() => window.__fp.hidden()), true);
    await page.keyboard.press("e");
    assert.equal(await page.evaluate(() => window.__fp.hidden()), false);
    // the last floor moves on its own
    await page.evaluate(() => { window.__fp.begin(3); window.__fp.quakeSoon(); });
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => window.__fp.house().shoves), 1, "the house slid a row or column by itself");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
