// Headless smoke test: boots the game, plays a few seconds, exercises the new
// abilities, captures console errors + screenshots.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const EXE = "/tmp/chromium";
const OUT = "/home/user/Arse-game/shots";
mkdirSync(OUT, { recursive: true });

const errors = [];
const launch = await chromium.launch({
  executablePath: EXE,
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--use-gl=angle",
  ],
});
const page = await launch.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text()); });
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));

console.log("loading…");
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${OUT}/01-menu.png` });
console.log("menu shot");

// start the mission
const start = page.locator("text=START MISSION").first();
await start.click({ timeout: 10000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/02-wave1.png` });
console.log("gameplay shot");

// fly forward for a couple of seconds
await page.keyboard.down("KeyW");
await page.waitForTimeout(2500);
await page.keyboard.up("KeyW");
await page.waitForTimeout(500);

// strike chain: J ×3
for (let i = 0; i < 3; i++) {
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(120);
  await page.keyboard.up("KeyJ");
  await page.waitForTimeout(220);
}
await page.screenshot({ path: `${OUT}/03-after-strikes.png` });
console.log("strikes done");

// flurry: hold J
await page.keyboard.down("KeyJ");
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/04-flurry.png` });
await page.keyboard.up("KeyJ");
console.log("flurry done");

// blast
await page.keyboard.down("KeyK");
await page.waitForTimeout(1200);
await page.keyboard.up("KeyK");

// cyclone
await page.keyboard.press("KeyH");
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/05-cyclone.png` });
await page.waitForTimeout(900);

// dash + dash-cancel punch
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(250);
await page.keyboard.down("KeyJ");
await page.waitForTimeout(200);
await page.keyboard.up("KeyJ");
await page.keyboard.up("ShiftLeft");
await page.waitForTimeout(600);

// block
await page.keyboard.down("KeyB");
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/06-block.png` });
await page.keyboard.up("KeyB");

// grab / clap attempts
await page.keyboard.press("KeyG");
await page.waitForTimeout(600);

// let waves spawn & AI run
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/07-combat.png` });
console.log("combat shot");

// hud numbers sanity
const hud = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return { w: c?.width, h: c?.height };
});
console.log("canvas:", JSON.stringify(hud));

await launch.close();
console.log("ERRORS:", errors.length);
for (const e of errors.slice(0, 20)) console.log("  " + e.slice(0, 300));
