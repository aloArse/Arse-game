// v6.5 VFX verification shots (SwiftShader GL). Usage: npm run preview (port 4173)
// then `node scripts/shot-vfx.mjs`. Writes /tmp/shot-eye.png, shot-vision.png,
// shot-shield.png, shot-blast.png, shot-cyclone.png.
import { chromium } from "playwright-core";
const EXE = "/tmp/chromium";
const errors = [];
const launch = await chromium.launch({
  executablePath: EXE, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib:/tmp", FONTCONFIG_FILE: "/tmp/fonts.conf" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
async function start(url) {
  const page = await launch.newPage({ viewport: { width: 480, height: 860 }, hasTouch: true, isMobile: true });
  page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text().slice(0, 200)); });
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.locator("text=START MISSION").first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__engine.fastForward(1.5));
  await page.waitForTimeout(800);
  return page;
}
// --- face closeup: eye marker + vision beam origin ---
const eye = await start("http://localhost:4173/?eyeTest=1");
await eye.screenshot({ path: "/tmp/shot-eye.png" });
console.log("eye shot ok");
await eye.keyboard.down("v");
await eye.waitForTimeout(900);
await eye.screenshot({ path: "/tmp/shot-vision.png" });
console.log("vision shot ok");
await eye.keyboard.up("v");
await eye.close();
// --- normal cam: shield / blast / cyclone geometry ---
const g = await start("http://localhost:4173/");
await g.keyboard.down("b");
await g.waitForTimeout(900);
await g.screenshot({ path: "/tmp/shot-shield.png" });
console.log("shield shot ok");
await g.keyboard.up("b");
await g.keyboard.down("k");
await g.waitForTimeout(700);
await g.screenshot({ path: "/tmp/shot-blast.png" });
console.log("blast shot ok");
await g.keyboard.up("k");
await g.keyboard.press("f");
await g.waitForTimeout(1200);
await g.screenshot({ path: "/tmp/shot-cyclone.png" });
console.log("cyclone shot ok");
await g.close();
console.log("errors:", errors.length ? errors.slice(0, 8) : "none");
await launch.close();
