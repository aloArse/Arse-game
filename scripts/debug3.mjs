import { chromium } from "playwright";
const EXE = "/tmp/chromium";
const errors = [];
const launch = await chromium.launch({
  executablePath: EXE, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 270 } });
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("ERR_CONNECTION")) errors.push("[console] " + m.text()); });

const dump = (label) => page.evaluate((l) => {
  const e = window.__engine;
  return {
    l,
    dead: e["heroDead"], hp: Math.round(e["hp"]),
    cycloneT: +e["cycloneT"].toFixed(2), slamPhase: e["slamPhase"],
    punchT: +e["punchT"].toFixed(2), clapT: +e["clapT"].toFixed(2),
    grabbed: !!e["grabbed"], msg: e.hud.msg.slice(0, 30),
    enemies: e.enemies.list.map((x) => `${x.kind}@${Math.round(x.obj.position.distanceTo(e.rig.group.position))}m${x.dead ? "†" : ""}${x.grabbed ? "G" : ""}`).join(" "),
    gameT: +e["t"].toFixed(1),
  };
}, label).then((r) => console.log(JSON.stringify(r)));

await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await page.waitForTimeout(2000);

// replicate smoke3: cyclone → brace → dash+dashpunch → strike → spawn → G
await page.keyboard.press("KeyH");
await page.waitForTimeout(6000);
await page.keyboard.down("KeyB");
await page.waitForTimeout(4000);
await page.keyboard.up("KeyB");
await dump("after-brace");

await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(600);
await page.keyboard.down("KeyJ");
await page.waitForTimeout(300);
await page.keyboard.up("KeyJ");
await page.keyboard.up("ShiftLeft");
await page.waitForTimeout(1500);
await dump("after-dashpunch");

await page.keyboard.down("KeyJ");
await page.waitForTimeout(150);
await page.keyboard.up("KeyJ");
await page.waitForTimeout(1500);
await dump("after-strike");

await page.evaluate(() => {
  const e = window.__engine;
  e["spawnAt"]("drone");
  const d = e.enemies.list[e.enemies.list.length - 1];
  const p = e.rig.group.position;
  const yaw = e.rig.group.rotation.y;
  d.obj.position.set(p.x + Math.sin(yaw) * 4, p.y, p.z + Math.cos(yaw) * 4);
});
await page.keyboard.press("KeyG");
await page.waitForTimeout(2500);
await dump("after-G");
await page.waitForTimeout(6000);
await dump("G+6s");

console.log("ERRORS:", errors.length);
for (const er of errors) console.log(" ", er.slice(0, 200));
await launch.close();
