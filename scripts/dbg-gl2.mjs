import { chromium } from "playwright";
// try variations until WebGL works
const variants = [
  { name: "gl-swiftshader", args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"] },
  { name: "angle-default-sw", args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] },
  { name: "angle-sw-gl", args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"] },
  { name: "sw-gl-nosanbox", args: ["--no-sandbox", "--disable-gpu"] },
];
for (const v of variants) {
  const launch = await chromium.launch({
    executablePath: "/tmp/chromium", headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
    args: v.args,
  });
  const page = await launch.newPage();
  await page.goto("about:blank");
  const gl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2") || c.getContext("webgl");
    return g ? (g.getParameter(g.VERSION) + " | " + g.getParameter(g.RENDERER)) : "NO WEBGL";
  });
  console.log(v.name, "→", gl);
  await launch.close();
}
