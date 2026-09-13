import { chromium } from "playwright";
const EXE = "/tmp/chromium";
const errors = [];
const launch = await chromium.launch({
  executablePath: EXE, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 270 } });
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));

await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await page.waitForTimeout(3000);

// 1) blast while playing
const r1 = await page.evaluate(() => {
  const e = window.__engine;
  const d0 = e.city.demolished;
  const b = e.city.buildings.find((x) => x.alive && x.top > 60);
  const V = e.rig.group.position.constructor;
  const destroyed = e.city.blast(new V(b.x, b.top - 10, b.z), 30, 99999, e.fx);
  return { mode: e.mode, destroyed, d: e.city.demolished - d0 };
});
console.log("BLAST while playing:", JSON.stringify(r1));

// 2) kill hero, wait for mode=over
await page.evaluate(() => { const e0 = window.__engine; const V0 = e0.rig.group.position.constructor; e0["damagePlayer"](99999, new V0(e0.rig.group.position.x + 3, e0.rig.group.position.y, e0.rig.group.position.z)); });
await page.waitForTimeout(4000);
const over = await page.evaluate(() => ({ mode: window.__engine.mode, dead: window.__engine["heroDead"] }));
console.log("after kill:", JSON.stringify(over));

// 3) same blast while game over
const r2 = await page.evaluate(() => {
  const e = window.__engine;
  const d0 = e.city.demolished;
  const b = e.city.buildings.find((x) => x.alive && x.top > 60);
  if (!b) return { nob: true, aliveTall: e.city.buildings.filter((x) => x.alive && x.top > 60).length };
  const V = e.rig.group.position.constructor;
  const destroyed = e.city.blast(new V(b.x, b.top - 10, b.z), 30, 99999, e.fx);
  return { mode: e.mode, destroyed, d: e.city.demolished - d0, bHp: b.bHp, alive: b.alive };
});
console.log("BLAST while game-over:", JSON.stringify(r2));

// 4) dropBomb while game over — do bombs update?
const r3 = await page.evaluate(() => {
  const e = window.__engine;
  const d0 = e.city.demolished;
  const b = e.city.buildings.find((x) => x.alive && x.top > 60);
  const V = e.rig.group.position.constructor;
  e.dropBomb(new V(b.x, b.top + 8, b.z), new V(0, -4, 0));
  return { dropped: true, d0 };
});
await page.waitForTimeout(10000);
const r4 = await page.evaluate((d0) => {
  const e = window.__engine;
  return { mode: e.mode, demolished: e.city.demolished, delta: e.city.demolished - d0 };
}, r3.d0);
console.log("BOMB while game-over:", JSON.stringify(r4));
console.log("ERRORS:", errors.length);
await launch.close();
