import { chromium } from "playwright";
const EXE = "/tmp/chromium";
const launch = await chromium.launch({
  executablePath: EXE, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 270 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await page.waitForTimeout(3000);
const dist = await page.evaluate(() => {
  const bs = window.__engine.city.buildings;
  const alive = bs.filter((b) => b.alive);
  const buckets = { "<30": 0, "30-60": 0, "60-100": 0, "100-150": 0, ">150": 0 };
  for (const b of bs) {
    const t = b.top;
    if (t < 30) buckets["<30"]++;
    else if (t < 60) buckets["30-60"]++;
    else if (t < 100) buckets["60-100"]++;
    else if (t < 150) buckets["100-150"]++;
    else buckets[">150"]++;
  }
  return { n: bs.length, alive: alive.length, buckets, maxTop: Math.max(...bs.map((b) => b.top)), demolished: window.__engine.city.demolished };
});
console.log("T=3s:", JSON.stringify(dist));
await page.waitForTimeout(30000);
const dist2 = await page.evaluate(() => {
  const bs = window.__engine.city.buildings;
  const alive = bs.filter((b) => b.alive);
  const tall = alive.filter((b) => b.top >= 60);
  return { n: bs.length, alive: alive.length, tall: tall.length, maxTop: Math.max(...bs.map((b) => b.top)), demolished: window.__engine.city.demolished, mode: window.__engine.mode, t: +window.__engine["t"].toFixed(1) };
});
console.log("T=33s:", JSON.stringify(dist2));
await launch.close();
