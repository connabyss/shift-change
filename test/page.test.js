// The game in a real (headless) browser: go inside, shove a row, walk, and let the shadow move.
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

test("go inside, shove your row with SHIFT, walk, and the shadow comes looking", { skip }, async () => {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__house);
    const get = () => page.evaluate(() => ({ scene: window.__house.scene(), ...window.__house.house() }));
    assert.equal((await get()).scene, "title");
    await page.keyboard.press("Enter");
    let h = await get();
    assert.equal(h.scene, "play");
    const start = h.player, hunter0 = h.hunter;
    await page.keyboard.press("Shift+ArrowRight");
    h = await get();
    assert.equal(h.shoves, 1);
    assert.deepEqual(h.player, { x: start.x + 1, y: start.y }, "you ride along with your row");
    await page.waitForTimeout(400);
    // tap the arrow that shoves your column up
    const a = await page.evaluate(() => window.__house.arrows(4).find((a) => a.axis === "col" && a.i === window.__house.house().player.x && a.dir === -1));
    await page.mouse.click(a.x, a.y);
    h = await get();
    assert.equal(h.shoves, 2);
    assert.equal(h.player.y, start.y - 1);
    let moved = false;
    for (let i = 0; i < 40 && !moved; i++) {
      await page.waitForTimeout(200);
      h = await get();
      moved = h.over || h.hunter.x !== hunter0.x || h.hunter.y !== hunter0.y;
    }
    assert.ok(moved, "the shadow came looking within 8 seconds");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
