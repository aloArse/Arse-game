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

await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await page.waitForTimeout(4000);

// --- blast in a single synchronous evaluate
const r1 = await page.evaluate(() => {
  const e = window.__engine;
  const before = e.city.demolished;
  const aliveTall = e.city.buildings.filter((b) => b.alive && b.top > 60).length;
  const b = e.city.buildings.find((x) => x.alive && x.top > 60);
  if (!b) return { before, aliveTall, err: "no building" };
  const V = e.rig.group.position.constructor;
  const p = new V(b.x, b.top - 10, b.z);
  const destroyed = e.city.blast(p, 30, 99999, e.fx);
  return {
    before, after: e.city.demolished, destroyed, aliveTall,
    bHp: b.hp, bAlive: b.alive,
  };
});
console.log("BLAST:", JSON.stringify(r1));

// --- grab with enemy at exact hero position
const r2 = await page.evaluate(() => {
  const e = window.__engine;
  e["spawnAt"]("drone");
  const d = e.enemies.list[e.enemies.list.length - 1];
  const p = e.rig.group.position;
  d.obj.position.set(p.x, p.y, p.z); // dead centre on the hero
  return { n: e.enemies.list.length, dist: d.obj.position.distanceTo(p) };
});
console.log("SPAWN:", JSON.stringify(r2));
await page.keyboard.press("KeyG");
await page.waitForTimeout(3000);
const r3 = await page.evaluate(() => {
  const e = window.__engine;
  return {
    grabbed: !!e["grabbed"], kind: e["grabbed"]?.kind ?? null,
    msg: e.hud.msg, clapT: +e["clapT"].toFixed(2),
    enemies: e.enemies.list.map((x) => `${x.kind}@${Math.round(x.obj.position.distanceTo(e.rig.group.position))}m${x.dead ? "†" : ""}`).join(", "),
    heroDead: e["heroDead"],
  };
});
console.log("AFTER-G:", JSON.stringify(r3));
await page.waitForTimeout(20000);
const r4 = await page.evaluate(() => {
  const e = window.__engine;
  return { grabbed: !!e["grabbed"], msg: e.hud.msg, heroDead: e["heroDead"], hp: Math.round(e["hp"]) };
});
console.log("LATER:", JSON.stringify(r4));

console.log("ERRORS:", errors.length);
for (const er of errors) console.log(" ", er.slice(0, 200));
await launch.close();
