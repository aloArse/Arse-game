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
page.on("console", (m) => { if (m.text().startsWith("[dbg]")) console.log(m.text().slice(0, 400)); });

await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await page.waitForTimeout(2000);

// instrument every damage path
await page.evaluate(() => {
  const e = window.__engine;
  const origDamage = e.damageEnemy.bind(e);
  e.damageEnemy = (en, dmg, combo) => {
    console.log(`[dbg] damageEnemy ${en.kind} ${dmg.toFixed(0)}dmg combo=${combo} held=${en.grabbed} stack=${new Error().stack.split("\n")[2]?.trim().slice(0, 90)}`);
    return origDamage(en, dmg, combo);
  };
  const origKill = e.killEnemy.bind(e);
  e.killEnemy = (en) => {
    console.log(`[dbg] KILL ${en.kind}`);
    return origKill(en);
  };
});

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
    grabbed: !!e["grabbed"], msg: e.hud.msg.slice(0, 24),
    enemies: e.enemies.list.map((x) => `${x.kind}${x.dead ? "†" : ""}${x.grabbed ? "G" : ""}@${Math.round(x.obj.position.distanceTo(e.rig.group.position))}m`).join(" "),
  };
});
console.log("STATE:", JSON.stringify(st));
console.log("ERRORS:", errors.length);
for (const er of errors) console.log(" ", er.slice(0, 200));
await launch.close();
