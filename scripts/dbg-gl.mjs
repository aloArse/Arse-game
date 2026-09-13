import { chromium } from "playwright";
const launch = await chromium.launch({
  executablePath: "/tmp/chromium", headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib", VK_ICD_FILENAMES: "/tmp/al2023/lib/vk_swiftshader_icd.json" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 270 } });
await page.goto("about:blank");
const gl = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const g = c.getContext("webgl2") || c.getContext("webgl");
  return g ? (g.getParameter(g.VERSION) + " | " + g.getParameter(g.RENDERER)) : "NO WEBGL";
});
console.log("GL:", gl);
await launch.close();
