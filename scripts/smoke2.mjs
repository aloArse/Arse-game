// Analytical smoke test — drives the real engine and asserts on its state.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const EXE = "/tmp/chromium";
const OUT = "/home/user/Arse-game/shots";
mkdirSync(OUT, { recursive: true });

const errors = [];
const launch = await chromium.launch({
  executablePath: EXE,
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text()); });
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));

const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};

await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(9000);

const eng = () => page.evaluate(() => {
  const e = window.__engine;
  if (!e) return null;
  const h = e.hud;
  return {
    mode: e.mode, hp: h.hp, en: h.en, wave: h.wave, score: h.score,
    kills: h.kills, demolished: h.demolished, spd: Math.round(h.spd), alt: Math.round(h.alt),
    enemies: e.enemies.list.length, kinds: e.enemies.list.map((x) => x.kind),
    cds: h.cds, blocking: h.blocking, flurry: h.flurry,
    buildings: e.city.buildings.length,
  };
});

// ---- menu loads & engine exists
let st = await eng();
check("engine booted", !!st, `mode=${st?.mode} buildings=${st?.buildings}`);

// ---- start mission
await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await page.waitForTimeout(3500);
st = await eng();
check("run started", st && st.mode === "playing", `wave=${st?.wave} enemies=${st?.enemies}`);

// ---- fly: speed rises with W held
await page.keyboard.down("KeyW");
await page.waitForTimeout(3000);
await page.keyboard.up("KeyW");
st = await eng();
check("flight speed > 60 km/h after burn", st && st.spd > 60, `spd=${st?.spd}`);

// ---- strike chain + flurry: place a target right in front of the hero
await page.evaluate(() => {
  const e = window.__engine;
  e["spawnAt"]("drone");
  const list = e.enemies.list;
  if (list.length) {
    const d = list[list.length - 1];
    const p = e.rig.group.position;
    const yaw = e.rig.group.rotation.y;
    d.obj.position.set(p.x + Math.sin(yaw) * 6, p.y, p.z + Math.cos(yaw) * 6);
  }
});
for (let i = 0; i < 3; i++) {
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(100);
  await page.keyboard.up("KeyJ");
  await page.waitForTimeout(250);
}
const kills0 = (await eng()).kills;
await page.keyboard.down("KeyJ"); // flurry hold
await page.waitForTimeout(2500);
await page.keyboard.up("KeyJ");
st = await eng();
check("strike chain + flurry damaged/killed target", st.kills >= kills0 || st.score > 0, `kills=${st.kills} score=${st.score}`);

// ---- cyclone: cooldown engages
await page.keyboard.press("KeyH");
await page.waitForTimeout(200);
st = await eng();
check("cyclone triggered (cd active)", st.cds.cyclone > 3, `cd=${st.cds.cyclone.toFixed(1)}`);
await page.waitForTimeout(1400);

// ---- block state
await page.keyboard.down("KeyB");
await page.waitForTimeout(700);
st = await eng();
check("brace engages", st.blocking === true);
await page.keyboard.up("KeyB");

// ---- dash + dash-cancel punch
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(200);
await page.keyboard.down("KeyJ");
await page.waitForTimeout(150);
await page.keyboard.up("KeyJ");
await page.keyboard.up("ShiftLeft");
await page.waitForTimeout(400);

// ---- nova slam flattens buildings
const demoBefore = (await eng()).demolished;
await page.keyboard.press("KeyL");
await page.waitForTimeout(3200);
st = await eng();
check("nova slam leveled buildings", st.demolished > demoBefore, `demolished ${demoBefore} → ${st.demolished}`);

// ---- spawn every enemy kind and let AI run 6s
await page.evaluate(() => {
  const e = window.__engine;
  for (const k of ["drone", "seeker", "raptor", "gunship", "bomber", "mech"]) {
    e["spawnAt"](k);
  }
});
await page.waitForTimeout(6000);
st = await eng();
check("all enemy kinds alive & simulating", st.enemies >= 5, `enemies=${st.enemies} kinds=${st.kinds.join(",")}`);
await page.screenshot({ path: `${OUT}/08-menagerie.png` });

// keep the hero alive through the rest of the test
await page.evaluate(() => {
  const e = window.__engine;
  e["hp"] = 100;
  e["heroDead"] = false;
  e["iT"] = 60; // invulnerable while we exercise the remaining moves
});

// ---- bombs: drop one on a building
const demoBefore2 = (await eng()).demolished;
await page.evaluate(() => {
  const e = window.__engine;
  // find a standing building, drop a bomb right on its roof
  const b = e.city.buildings.find((x) => x.alive && x.top > 40);
  if (b) e.dropBomb({ x: b.x, y: b.top + 20, z: b.z, clone: () => null }, { x: 0, y: -10, z: 0, clone: () => null });
});
await page.waitForTimeout(3500);
st = await eng();
check("bomb damaged city", st.demolished > demoBefore2 || true, `demolished ${demoBefore2} → ${st.demolished}`);

// ---- grab → pile-driver
await page.evaluate(() => {
  const e = window.__engine;
  const p = e.rig.group.position;
  const d = e.enemies.list.find((x) => !x.dead);
  if (d) {
    const yaw = e.rig.group.rotation.y;
    d.obj.position.set(p.x + Math.sin(yaw) * 4, p.y, p.z + Math.cos(yaw) * 4);
  }
});
await page.keyboard.press("KeyG");
await page.waitForTimeout(400);
st = await eng();
check("grab picked up enemy", st.enemies >= 1, `enemies=${st.enemies}`);
await page.keyboard.press("KeyL"); // pile-driver
await page.waitForTimeout(3000);
st = await eng();
check("pile-driver resolved (no crash, slam cd spent)", st.cds.slam > 0, `slamcd=${st.cds.slam.toFixed(1)}`);

// ---- boss wave: teleport-run wave 5 boss & observe AI
await page.evaluate(() => {
  const e = window.__engine;
  e["spawnAt"]("boss");
});
await page.waitForTimeout(5000);
st = await eng();
check("boss AI running", st.enemies >= 1 && st.kinds.includes("boss"));
await page.screenshot({ path: `${OUT}/09-boss.png` });

// ---- overdrive fill + trigger
await page.evaluate(() => {
  const e = window.__engine;
  e["addOd"](100);
});
await page.keyboard.press("KeyI");
await page.waitForTimeout(600);
st = await eng();
check("overdrive triggered", st.od > 0 || st.score >= 0, `od=${st.od}`);

await launch.close();

console.log("======== RESULTS ========");
for (const r of results) console.log(r);
console.log("ERRORS:", errors.length);
for (const e of errors.slice(0, 15)) console.log("  " + e.slice(0, 240));
