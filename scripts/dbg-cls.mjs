import { chromium } from "playwright";
const launch = await chromium.launch({
  executablePath: "/tmp/chromium", headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 740, height: 360 } });
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 15000 });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const containers = [...document.querySelectorAll("div")].filter((d) => d.className.toString().includes("origin-bottom-right"));
  return containers.map((c) => {
    const r = c.getBoundingClientRect();
    return {
      cls: c.className.toString().slice(0, 130),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      computedBottom: getComputedStyle(c).bottom, computedDisplay: getComputedStyle(c).display,
    };
  });
});
console.log(JSON.stringify(info, null, 1));
// also one button's className + computed top
const btn = await page.evaluate(() => {
  const b = document.querySelector('button[aria-label="Brace"]');
  if (!b) return null;
  return { cls: b.className.toString().slice(0, 120), top: getComputedStyle(b).top, pos: getComputedStyle(b).position };
});
console.log("Brace button:", JSON.stringify(btn));
await launch.close();
