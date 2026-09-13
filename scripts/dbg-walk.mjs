import { chromium } from "playwright";
const launch = await chromium.launch({
  executablePath: "/tmp/chromium", headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 270 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 15000 });
await page.waitForTimeout(3000);

// land at a known open spot: find a street cell (surfaceY=0)
const spot = await page.evaluate(() => {
  const e = window.__engine;
  for (let x = -200; x < 200; x += 40) {
    for (let z = -200; z < 200; z += 40) {
      if (e.city.surfaceY(x, z) === 0) return { x, z };
    }
  }
  return { x: 0, z: 0 };
});
console.log("street spot:", JSON.stringify(spot));
await page.evaluate((s) => {
  const e = window.__engine;
  e["pos"].set(s.x, 3, s.z);
  e["vel"].set(0, -5, 0);
  e["cruise"] = 0;
  e["hp"] = 1000; e["iT"] = 3600; e.mode = "playing";
}, spot);
await page.keyboard.down("KeyC");
await page.waitForTimeout(6000);
await page.keyboard.up("KeyC");
await page.keyboard.down("KeyW");
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1200);
  const st = await page.evaluate(() => {
    const e = window.__engine;
    return {
      grounded: !!e["grounded"], spd: Math.round(Math.hypot(e["vel"].x, e["vel"].z)),
      y: +e["pos"].y.toFixed(1), x: +e["pos"].x.toFixed(0), z: +e["pos"].z.toFixed(0),
      walkT: +e["walkT"].toFixed(2), t: +e["t"].toFixed(2),
    };
  });
  console.log("W-held:", JSON.stringify(st));
}
await page.keyboard.up("KeyW");

// vision debug
await page.evaluate(() => { window.__engine["en"] = 100; });
await page.keyboard.down("KeyV");
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(1200);
  const st = await page.evaluate(() => {
    const e = window.__engine;
    return { en: +e["en"].toFixed(1), beam: !!e["beam"]?.visible, t: +e["t"].toFixed(2) };
  });
  console.log("V-held:", JSON.stringify(st));
}
await page.keyboard.up("KeyV");
await launch.close();
