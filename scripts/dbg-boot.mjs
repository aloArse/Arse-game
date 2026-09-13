import { chromium } from "playwright";
const launch = await chromium.launch({
  executablePath: "/tmp/chromium", headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message + "\n" + (e.stack||"").slice(0, 400)));
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(9000);
const dialog = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log("DIALOG TEXT:", dialog);
console.log("ERRORS:", JSON.stringify(errors, null, 1).slice(0, 800));
await launch.close();
