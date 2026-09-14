// Verify on-screen controls never overlap, across viewports
import { chromium } from "playwright";
const EXE = "/tmp/chromium";
const errors = [];
const launch = await chromium.launch({
  executablePath: EXE, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const viewports = [
  { name: "portrait-small", w: 360, h: 640 },
  { name: "portrait-tall", w: 392, h: 860 },
  { name: "landscape", w: 740, h: 360 },
  { name: "tablet-landscape", w: 920, h: 420 },
];
let allOk = true;
for (const vp of viewports) {
  const page = await launch.newPage({ viewport: { width: vp.w, height: vp.h } });
  page.on("pageerror", (e) => errors.push(`[${vp.name}] ` + e.message));
  await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.locator("text=START MISSION").first().click({ timeout: 15000 });
  await page.waitForTimeout(3000);
  const res = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button[aria-label]")].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 5 && r.height > 5 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.top >= -1;
    });
    const rects = btns.map((b) => ({ n: b.getAttribute("aria-label"), r: b.getBoundingClientRect() }));
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r, c = rects[j].r;
        const ix = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left));
        const iy = Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
        if (ix > 4 && iy > 4) overlaps.push(`${rects[i].n}∩${rects[j].n} ${Math.round(ix)}x${Math.round(iy)}`);
      }
    }
    // also verify every visible button is fully inside the viewport
    const outside = rects.filter((x) => x.r.right > window.innerWidth + 2 || x.r.bottom > window.innerHeight + 2).map((x) => x.n);
    return { n: rects.length, overlaps, outside, vw: window.innerWidth, vh: window.innerHeight };
  });
  const ok = res.overlaps.length === 0 && res.outside.length === 0 && res.n >= 12;
  allOk = allOk && ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${vp.name} (${vp.w}×${vp.h}) — ${res.n} buttons, overlaps=${JSON.stringify(res.overlaps)}, outside=${JSON.stringify(res.outside)}`);
  await page.close();
}
console.log(allOk ? "ALL VIEWPORTS CLEAN" : "LAYOUT PROBLEMS FOUND");
console.log("ERRORS:", errors.length, errors.slice(0, 3));
await launch.close();
