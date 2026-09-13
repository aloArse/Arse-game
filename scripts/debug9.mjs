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
page.on("console", (m) => { if (m.text().startsWith("[dbg]")) console.log(m.text().slice(0, 300)); });

await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await page.waitForTimeout(2000);

await page.evaluate(() => {
  const e = window.__engine;
  const orig = e.doGrabOrClap.bind(e);
  e.doGrabOrClap = () => {
    const list = e.enemies.list
      .map((x) => `${x.kind}${x.dead ? "†" : ""}${x.grabbed ? "G" : ""}@${x.obj.position.distanceTo(e.rig.group.position).toFixed(1)}m`)
      .join(",");
    console.log(`[dbg] doGrabOrClap grabbed=${!!e["grabbed"]} clapT=${+e["clapT"].toFixed(2)} cycloneT=${+e["cycloneT"].toFixed(2)} slamPhase=${e["slamPhase"]} dead=${e["heroDead"]} mode=${e.mode} list=[${list}]`);
    return orig();
  };
});

// ---- smoke3 exact flow ----
await page.keyboard.down("KeyW");
for (let i = 0; i < 20 && !(await page.evaluate(() => window.__engine.hud.spd > 80)); i++) await page.waitForTimeout(400);
await page.keyboard.up("KeyW");

await page.evaluate(() => { const e = window.__engine; e["hp"] = 100; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing"; });
await page.keyboard.press("KeyH");
for (let i = 0; i < 40 && !(await page.evaluate(() => window.__engine.hud.cds.cyclone > 0)); i++) await page.waitForTimeout(400);
for (let i = 0; i < 80 && !(await page.evaluate(() => window.__engine["cycloneT"] <= 0)); i++) await page.waitForTimeout(400);

await page.evaluate(() => { const e = window.__engine; e["hp"] = 100; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing"; });
await page.keyboard.down("KeyB");
for (let i = 0; i < 40 && !(await page.evaluate(() => window.__engine.hud.blocking)); i++) await page.waitForTimeout(400);
await page.keyboard.up("KeyB");

await page.evaluate(() => { const e = window.__engine; e["hp"] = 100; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing"; });
await page.keyboard.down("ShiftLeft");
for (let i = 0; i < 40 && !(await page.evaluate(() => window.__engine["dashT"] > 0)); i++) await page.waitForTimeout(400);
await page.keyboard.down("KeyJ");
await page.waitForTimeout(150);
await page.keyboard.up("KeyJ");
await page.keyboard.up("ShiftLeft");

await page.evaluate(() => { const e = window.__engine; e["hp"] = 100; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing"; });
await page.keyboard.down("KeyJ");
await page.waitForTimeout(120);
await page.keyboard.up("KeyJ");
for (let i = 0; i < 30 && !(await page.evaluate(() => window.__engine["punchT"] > 0 || window.__engine["cd"].strike > 0)); i++) await page.waitForTimeout(400);

await page.evaluate(() => { const e = window.__engine; e["hp"] = 100; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing"; });
const spawned = await page.evaluate(() => {
  const e = window.__engine;
  e["spawnAt"]("drone");
  const d = e.enemies.list[e.enemies.list.length - 1];
  const p = e.rig.group.position;
  const yaw = e.rig.group.rotation.y;
  d.obj.position.set(p.x + Math.sin(yaw) * 1.5, p.y, p.z + Math.cos(yaw) * 1.5);
  if (d.v) d.v.set(0, 0, 0);
  return { ok: true, dist: d.obj.position.distanceTo(p).toFixed(1) };
});
console.log("spawned:", JSON.stringify(spawned));
await page.keyboard.press("KeyG");
await page.waitForTimeout(8000);
const st = await page.evaluate(() => {
  const e = window.__engine;
  return {
    grabbed: !!e["grabbed"], msg: e.hud.msg.slice(0, 24), punchT: +e["punchT"].toFixed(2),
    enemies: e.enemies.list.map((x) => `${x.kind}${x.dead ? "†" : ""}${x.grabbed ? "G" : ""}@${Math.round(x.obj.position.distanceTo(e.rig.group.position))}m`).join(" "),
  };
});
console.log("STATE:", JSON.stringify(st));
console.log("ERRORS:", errors.length);
await launch.close();
