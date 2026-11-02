// The game in a real (headless) browser: clock in, test a lever, stamp the notes, clock out.
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
      const path = new URL(req.url, "http://x").pathname;
      try {
        const body = await readFile(join(ROOT, path === "/" ? "index.html" : path));
        res.writeHead(200, { "content-type": extname(path) === ".js" ? "text/javascript" : "text/html" }).end(body);
      } catch { res.writeHead(404).end(); }
    }).listen(0, "127.0.0.1", () => ok(s));
  });
}

async function play(fn) {
  const server = await serve(), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__shift);
    // tap at a point in game units (the canvas is 960 x 600 game units)
    const tap = async (x, y) => {
      const box = await page.locator("canvas").boundingBox();
      await page.mouse.click(box.x + (x / 960) * box.width, box.y + (y / 600) * box.height);
    };
    const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
    const parts = (id) => page.evaluate((id) => {
      const s = window.__shift, m = s.state().machines.find((x) => x.id === id);
      return s.layout(m);
    }, id);
    await fn({ page, tap, center, parts });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
}

test("night 1 from the title: catch the liar, trust the real fix, clock out", { skip }, async () => {
  await play(async ({ page, tap, center, parts }) => {
    assert.equal(await page.evaluate(() => window.__shift.scene()), "title");
    await tap(480, 300);
    assert.equal(await page.evaluate(() => window.__shift.scene()), "play");
    const machines = await page.evaluate(() => window.__shift.state().machines.map((m) => ({ id: m.id, lies: m.lies })));
    assert.equal(machines.length, 3);
    for (const m of machines) {
      const L = await parts(m.id);
      await tap(...center(L.lever)); // pull it back to the old way
      const after = await page.evaluate((id) => window.__shift.state().machines.find((x) => x.id === id), m.id);
      assert.equal(after.lever, "old");
      assert.equal(after.broken, !m.lies, "a real fix breaks the old way, a lie runs fine");
      if (after.broken) await tap(...center(L.lever)); // put it back before the gauge blows
      await tap(...center(L.note));
      assert.equal(await page.evaluate(() => window.__shift.menu()), m.id);
      await tap(...center(m.lies ? L.liar : L.truth));
    }
    await page.waitForFunction(() => window.__shift.scene() === "end");
    const s = await page.evaluate(() => window.__shift.state());
    assert.equal(s.won, true);
    assert.deepEqual(s.machines.map((m) => m.stamp), s.machines.map((m) => (m.lies ? "LIAR" : "TRUE")));
    await page.waitForTimeout(700);
    await tap(480, 300);
    assert.equal(await page.evaluate(() => window.__shift.night()), 2);
  });
});

test("tapping empty floor closes a note's stamp menu without stamping", { skip }, async () => {
  await play(async ({ page, tap, center, parts }) => {
    await tap(480, 300);
    const id = await page.evaluate(() => window.__shift.state().machines[0].id);
    await tap(...center((await parts(id)).note));
    assert.equal(await page.evaluate(() => window.__shift.menu()), id);
    await tap(10, 590);
    assert.equal(await page.evaluate(() => window.__shift.menu()), null);
    assert.equal(await page.evaluate((id) => window.__shift.state().machines.find((m) => m.id === id).stamp, id), null);
  });
});
