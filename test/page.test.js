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

test("first person: walk, change a line of the house's code (your row slides, you ride along), unlock the door, hide", { skip }, async () => {
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
    const sh1 = await page.evaluate(() => ({ ...window.__fp.shadow() }));
    assert.deepEqual([sh1.x, sh1.y], [sh0.x, sh0.y], "the sleeping shadow hasn't moved");
    // the arrow at the top points the way to the lock's line of code
    assert.equal(await page.evaluate(() => window.__fp.way()?.what), "the lock's code");
    // stand in front of your first room's writing on the wall, facing it: the line shows, E changes its one word
    await page.evaluate(() => {
      const map = window.__fp.map(), m = window.__fp.me();
      const rx = Math.floor(m.x / 5), ry = Math.floor(m.y / 5);
      for (let y = ry * 5; y < ry * 5 + 5; y++) for (let x = rx * 5; x < rx * 5 + 5; x++) if (map.kind[y][x] === 4) { m.x = x + 0.5; m.y = y + 1.5; m.a = -Math.PI / 2; }
    });
    assert.equal(await page.evaluate(() => window.__fp.facingCode()?.c.kind), "shift");
    const before = await me();
    await page.keyboard.press("e");
    await page.waitForTimeout(700);
    const after = await me();
    assert.equal(await page.evaluate(() => window.__fp.house().shoves), 1, "changing the word slid the row");
    assert.ok(Math.abs((after.x - before.x) - 5) < 0.01 || before.x - after.x > 10, "rode along one room east (or wrapped round)");
    assert.equal(await page.evaluate(() => window.__fp.facingCode()?.c.dir), -1, "the line now reads west: press again to undo");
    assert.equal(await page.evaluate(() => window.__fp.mind()?.text), "house.watch(you);", "the house noticed");
    // the lock: change its word and the front door opens
    await page.evaluate(() => {
      const map = window.__fp.map(), m = window.__fp.me(), codes = window.__fp.codes();
      for (let ry = 0; ry < codes.length; ry++) for (let rx = 0; rx < codes[0].length; rx++) if (codes[ry][rx]?.kind === "lock") { m.x = rx * 5 + 3.5; m.y = ry * 5 + 1.5; m.a = -Math.PI / 2; }
    });
    assert.equal(await page.evaluate(() => window.__fp.hasKey()), false);
    await page.keyboard.press("e");
    assert.equal(await page.evaluate(() => window.__fp.hasKey()), true, "frontDoor.locked = false");
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__fp.way()?.what), "the door");
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
