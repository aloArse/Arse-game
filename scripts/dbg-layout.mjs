import { chromium } from "playwright";
const launch = await chromium.launch({
  executablePath: "/tmp/chromium", headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
for (const vp of [{ w: 360, h: 640 }, { w: 740, h: 360 }]) {
  const page = await launch.newPage({ viewport: { width: vp.w, height: vp.h } });
  await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(8000);
  await page.locator("text=START MISSION").first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  const dump = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll("button[aria-label]")) {
      const r = b.getBoundingClientRect();
      const st = getComputedStyle(b.parentElement);
      out.push({
        n: (b.getAttribute("aria-label") || "").slice(0, 18),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        disp: st.display, transform: st.transform.slice(0, 24),
      });
    }
    return { n: out.length, vw: innerWidth, vh: innerHeight, btns: out };
  });
  console.log(`== ${vp.w}×${vp.h} (${dump.n} buttons) ==`);
  for (const b of dump.btns) console.log(`  ${b.n.padEnd(18)} x=${b.x} y=${b.y} ${b.w}x${b.h} disp=${b.disp} tf=${b.transform}`);
  await page.close();
}
await launch.close();
