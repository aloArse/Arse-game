import { chromium } from "playwright";
const launch = await chromium.launch({
  executablePath: "/tmp/chromium", headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 270 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 150)));
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 15000 });
await page.waitForTimeout(3000);
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => {
    const e = window.__engine;
    e["cd"].strike = 0;
    e["hp"] = 1000; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing";
  });
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyJ");
  // poll spin for 2.5s
  let log = [];
  for (let k = 0; k < 5; k++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({
      step: window.__engine["comboStep"],
      spin: +window.__engine["spinT"].toFixed(2),
      cd: +window.__engine["cd"].strike.toFixed(2),
      punchT: +window.__engine["punchT"].toFixed(2),
      win: +window.__engine["comboWindow"].toFixed(2),
      dead: window.__engine["heroDead"],
      flurry: window.__engine["flurryOn"],
    }));
    log.push(st);
  }
  console.log(`press${i + 1}:`, JSON.stringify(log[0]), "→", JSON.stringify(log[4]));
}
await launch.close();
