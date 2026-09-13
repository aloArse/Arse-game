import { chromium } from "playwright";

const EXE = "/tmp/chromium";
const errors = [];
const launch = await chromium.launch({
  executablePath: EXE, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text()); });

await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(9000);
await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await page.waitForTimeout(2500);

const dump = async (label) => {
  const s = await page.evaluate(() => {
    const e = window.__engine;
    return {
      hp: Math.round(e["hp"]), en: Math.round(e["en"]), dead: e["heroDead"],
      punchT: +e["punchT"].toFixed(2), blastT: +e["blastT"].toFixed(2),
      clapT: +e["clapT"].toFixed(2), dashT: +e["dashT"].toFixed(2),
      cycloneT: +e["cycloneT"].toFixed(2), grabbed: !!e["grabbed"],
      slamPhase: e["slamPhase"], blockT: +e["blockT"].toFixed(2),
      cds: Object.fromEntries(Object.entries(e["cd"]).map(([k, v]) => [k, +v.toFixed(1)])),
      enemies: e.enemies.list.map((x) => x.kind + (x.dead ? "†" : "")).join(","),
      frame: e["t"].toFixed(1),
    };
  });
  console.log(label, JSON.stringify(s));
  return s;
};

await dump("after-start:");

// wait for wave 1 to spawn something
await page.waitForTimeout(4000);
await dump("wave1:");

// cyclone
await page.keyboard.press("KeyH");
await page.waitForTimeout(300);
await dump("after-H:");

// block
await page.keyboard.down("KeyB");
await page.waitForTimeout(800);
await dump("holding-B:");
await page.keyboard.up("KeyB");

// slam
await page.keyboard.press("KeyL");
await page.waitForTimeout(600);
await dump("after-L:");

await page.waitForTimeout(3000);
await dump("after-slam-settle:");

console.log("ERRORS:", errors.length);
for (const e of errors) console.log(" ", e.slice(0, 200));
await launch.close();
