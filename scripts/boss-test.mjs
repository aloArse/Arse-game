// Boss fight test — deterministic per-frame recording via in-page hooks
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
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 15000 });
await page.waitForTimeout(2500);
const check = (name, ok, extra = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);

// install recorders
await page.evaluate(() => {
  const e = window.__engine;
  window.__rec = { states: new Set(), judged: 0, struck: 0, minionSpawns: 0, minions: new Set() };
  const oj = e["addJudgement"].bind(e);
  e["addJudgement"] = (x, z, d) => { window.__rec.judged++; return oj(x, z, d); };
  const os = e["cityStrike"].bind(e);
  e["cityStrike"] = (x, z, r, d) => { window.__rec.struck++; return os(x, z, r, d); };
  const osm = e.enemies.spawn.bind(e.enemies);
  e.enemies.spawn = (k, p, h, bi) => {
    if (e.enemies.boss && !e.enemies.boss.dead && k === "drone") window.__rec.minionSpawns++;
    return osm(k, p, h, bi);
  };
  window.__rec.mode = "playing"; window.__rec.t = 0; window.__rec.dist = -1;
  const tick = () => {
    const b = e.enemies.boss;
    window.__rec.mode = e.mode; window.__rec.t = e["t"];
    if (b && !b.dead) {
      window.__rec.states.add(`${b.bossName}:${b.state}`);
      window.__rec.dist = Math.round(b.obj.position.distanceTo(e.rig.group.position));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// aging: read internals directly
const age = await page.evaluate(() => {
  const e = window.__engine;
  const before = e["heroAge"];
  e["growAge"](3);
  return { before, after: e["heroAge"], saved: +window.localStorage.getItem("sg_age_v1"), power: Math.round(e["powerMult"]() * 100), maxHp: e["hpMax"]() };
});
check("aging system (dmg/speed/hp scale + persists)", age.after === 21 && age.saved === 21 && age.power === 109 && age.maxHp === 108, JSON.stringify(age));

const fights = {};
for (const [wave, cls] of [[5, "KURGAN"], [10, "THRAXA"], [15, "CONQUEST"]]) {
  await page.evaluate((w) => {
    const e = window.__engine;
    for (const en of [...e.enemies.list]) e.enemies.remove(en);
    window.__rec.states.clear(); window.__rec.judged = 0; window.__rec.struck = 0; window.__rec.minionSpawns = 0;
    e["wave"] = w;
    e["spawnAt"]("boss");
    e["hp"] = 1000; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing";
  }, wave);
  const info = await page.evaluate(() => {
    const e = window.__engine;
    const b = e.enemies.boss;
    return { name: b.bossName, hp: Math.round(b.maxHp) };
  });
  await page.waitForTimeout(55000);
  fights[cls] = await page.evaluate(() => ({
    states: [...window.__rec.states],
    judged: window.__rec.judged, struck: window.__rec.struck, minions: window.__rec.minionSpawns,
    bossAlive: !window.__engine.enemies.boss?.dead,
    mode: window.__rec.mode, gameT: +window.__rec.t.toFixed(1), lastDist: window.__rec.dist,
  }));
  const f = fights[cls];
  console.log(`   ${cls} → mode=${fights[cls].mode} gameT=${fights[cls].gameT} dist=${fights[cls].lastDist} alive=${fights[cls].bossAlive}`);
  check(
    `${cls} multi-state moveset`,
    f.states.filter((s) => s.startsWith(cls ? info.name : "")).length >= 3,
    `${info.name} hp=${info.hp} states=[${f.states.map((s) => s.split(":")[1]).join(",")}]`,
  );
}
const c = fights.CONQUEST;
check("CONQUEST judgement strikes + summons", c.judged >= 1 && c.struck >= 1 && c.minions >= 3, `judged=${c.judged} struck=${c.struck} minions=${c.minions}`);
check("zero page errors", errors.length === 0, `${errors.length}`);
for (const e of errors.slice(0, 5)) console.log("  " + e.slice(0, 200));
await launch.close();
