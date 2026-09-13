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
page.on("console", (m) => { if (m.text().startsWith("[dbg]")) console.log(m.text().slice(0, 320)); });

await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await page.waitForTimeout(2000);

await page.evaluate(() => {
  const e = window.__engine;
  const origDamage = e.damageEnemy.bind(e);
  e.damageEnemy = (en, dmg, combo) => {
    console.log(`[dbg] dmg ${en.kind} ${dmg.toFixed(0)} held=${en.grabbed} thrown=${en.thrown.toFixed(1)} @${en.obj.position.distanceTo(e.rig.group.position).toFixed(0)}m src=${new Error().stack.split("\n")[2]?.trim().replace(/http[^ ]+/g, "").slice(0, 60)}`);
    return origDamage(en, dmg, combo);
  };
});

// exact smoke3 sequence
await page.keyboard.press("KeyH");
await page.waitForTimeout(6000);
await page.keyboard.down("KeyB");
await page.waitForTimeout(4000);
await page.keyboard.up("KeyB");
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(600);
await page.keyboard.down("KeyJ");
await page.waitForTimeout(300);
await page.keyboard.up("KeyJ");
await page.keyboard.up("ShiftLeft");
await page.waitForTimeout(1500);
await page.keyboard.down("KeyJ");
await page.waitForTimeout(150);
await page.keyboard.up("KeyJ");
await page.waitForTimeout(1500);

await page.evaluate(() => {
  const e = window.__engine;
  e["spawnAt"]("drone");
  const d = e.enemies.list[e.enemies.list.length - 1];
  const p = e.rig.group.position;
  d.obj.position.set(p.x + Math.sin(e.rig.group.rotation.y) * 4, p.y, p.z + Math.cos(e.rig.group.rotation.y) * 4);
});
await page.keyboard.press("KeyG");
await page.waitForTimeout(12000);
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
