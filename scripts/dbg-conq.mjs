import { chromium } from "playwright";
const errors = [];
const launch = await chromium.launch({
  executablePath: "/tmp/chromium", headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 270 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.text().startsWith("[cq]")) console.log(m.text()); });
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 15000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const e = window.__engine;
  // trace state transitions + rolls
  let last = "";
  const tick = () => {
    const b = e.enemies.boss;
    if (b && !b.dead && b.bossName === "CONQUEST" && b.state !== last) {
      last = b.state;
      console.log(`[cq] → ${b.state} (stateT=${+b.stateT.toFixed(2)})`);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.evaluate(() => {
  const e = window.__engine;
  for (const en of [...e.enemies.list]) e.enemies.remove(en);
  e["wave"] = 15;
  e["spawnAt"]("boss");
  e["hp"] = 1000; e["heroDead"] = false; e["iT"] = 3600;
});
await page.waitForTimeout(25000);
const st = await page.evaluate(() => {
  const e = window.__engine;
  const b = e.enemies.boss;
  return { state: b?.state, stateT: +b?.stateT.toFixed(2), t: +e["t"].toFixed(1), dist: b ? Math.round(b.obj.position.distanceTo(e.rig.group.position)) : -1, hp: Math.round(b?.hp) };
});
console.log("FINAL:", JSON.stringify(st), "errors:", errors.length);
await launch.close();
