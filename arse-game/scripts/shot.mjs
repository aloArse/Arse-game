// Headless screenshots of the real game (SwiftShader GL): menu showcase +
// gameplay. Usage: npm run preview (port 4173) then `node scripts/shot.mjs`.
// Writes /tmp/shot-menu.png and /tmp/shot-game.png.
import { chromium } from "playwright-core";
const EXE = "/tmp/chromium";
const errors = [];
const launch = await chromium.launch({
  executablePath: EXE, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib:/tmp", FONTCONFIG_FILE: "/tmp/fonts.conf" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 860 }, hasTouch: true, isMobile: true });
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text().slice(0, 200)); });
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(9000);
await page.screenshot({ path: "/tmp/shot-menu.png" });
console.log("menu shot ok, engine:", await page.evaluate(() => !!window.__engine));
await page.locator("text=START MISSION").first().click({ timeout: 15000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__engine.fastForward(3));
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/shot-game.png" });
console.log("game shot ok");
console.log("errors:", errors.length ? errors.slice(0, 8) : "none");
await launch.close();
