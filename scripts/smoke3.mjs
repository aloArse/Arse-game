// Poll-based integration test (headless swiftshader runs the game very slow,
// so we poll game state instead of assuming real-time timings).
// A hero keepalive (hp/heroDead/mode/iT reset) runs before each critical step:
// the hero sits idle under fire for minutes of real time, and a dead hero
// (mode "over") freezes bombs/updates — which is test noise, not engine bugs.
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

const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);

const evalEngine = (fn, arg) => page.evaluate(fn, arg);
const poll = async (fn, timeoutMs) => {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeoutMs) {
    last = await fn();
    if (last) return { ok: true, value: last, ms: Date.now() - t0 };
    await page.waitForTimeout(400);
  }
  return { ok: false, value: last, ms: Date.now() - t0 };
};
// keep the hero alive & the sim running through long polls
const keepalive = () => evalEngine(() => {
  const e = window.__engine;
  e["hp"] = 100; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing";
});
// pick the alive tall building farthest from the hero (away from earlier blast zones)
const farTall = () => evalEngine(() => {
  const e = window.__engine;
  const p = e.rig.group.position;
  let best = null, bd = -1;
  for (const b of e.city.buildings) {
    if (!b.alive || b.top < 60) continue;
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d > bd) { bd = d; best = b; }
  }
  return best ? { x: best.x, z: best.z, top: best.top, d: Math.round(bd) } : null;
});

await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
const boot = await evalEngine(() => ({ e: !!window.__engine, buildings: window.__engine?.city.buildings.length }));
check("engine booted", boot.e && boot.buildings > 100, `buildings=${boot.buildings}`);

await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await poll(() => evalEngine(() => window.__engine.mode === "playing"), 30000);
check("run started", await evalEngine(() => window.__engine.mode === "playing"));

// --- flight
await page.keyboard.down("KeyW");
const fly = await poll(() => evalEngine(() => window.__engine.hud.spd > 80 ? { spd: Math.round(window.__engine.hud.spd) } : null), 40000);
await page.keyboard.up("KeyW");
check("afterburner flight", fly.ok, `spd=${fly.value?.spd ?? "?"}`);

// --- cyclone
await keepalive();
await page.keyboard.press("KeyH");
const cyc = await poll(() => evalEngine(() => window.__engine.hud.cds.cyclone > 0 ? { cd: +window.__engine.hud.cds.cyclone.toFixed(1) } : null), 30000);
check("cyclone engages", cyc.ok, `cd=${cyc.value?.cd ?? "?"}`);
await poll(() => evalEngine(() => window.__engine["cycloneT"] <= 0), 60000);

// --- brace
await keepalive();
await page.keyboard.down("KeyB");
const blk = await poll(() => evalEngine(() => window.__engine.hud.blocking ? { bt: +window.__engine["blockT"].toFixed(2) } : null), 30000);
await page.keyboard.up("KeyB");
check("brace engages", blk.ok, `blockT=${blk.value?.bt ?? "?"}`);

// --- dash + dash-cancel punch
await keepalive();
await page.keyboard.down("ShiftLeft");
const dash = await poll(() => evalEngine(() => window.__engine["dashT"] > 0 ? { d: true } : null), 30000);
await page.keyboard.down("KeyJ");
await page.waitForTimeout(150);
await page.keyboard.up("KeyJ");
await page.keyboard.up("ShiftLeft");
check("sonic dash engages", dash.ok);

// --- strike chain
await keepalive();
await page.keyboard.down("KeyJ");
await page.waitForTimeout(120);
await page.keyboard.up("KeyJ");
const strike = await poll(() => evalEngine(() => window.__engine["punchT"] > 0 || window.__engine["cd"].strike > 0 ? { t: true } : null), 20000);
check("strike chain engages", strike.ok);
// let the jab finish — its active hitbox would kill the grab victim on spawn
await poll(() => evalEngine(() => window.__engine["punchT"] <= 0 ? { t: true } : null), 30000);

// --- spawn a victim in front, grab it, pile-drive it
await keepalive();
await evalEngine(() => {
  const e = window.__engine;
  e["spawnAt"]("drone");
  const d = e.enemies.list[e.enemies.list.length - 1];
  const p = e.rig.group.position;
  const yaw = e.rig.group.rotation.y;
  // park it 1.5m in front with zero velocity — its orbit AI steers away at
  // ~30 m/s, so a far spawn outruns the 5m grab radius within a frame or two
  d.obj.position.set(p.x + Math.sin(yaw) * 1.5, p.y, p.z + Math.cos(yaw) * 1.5);
  if (d.v) d.v.set(0, 0, 0);
});
await page.keyboard.press("KeyG");
const grab = await poll(() => evalEngine(() => window.__engine["grabbed"] ? { kind: window.__engine["grabbed"].kind } : null), 30000);
check("grab seizes enemy", grab.ok, `victim=${grab.value?.kind ?? "none"}`);

await keepalive();
await page.keyboard.press("KeyL");
const pd = await poll(() => evalEngine(() => {
  const ph = window.__engine["slamPhase"];
  return ph === "pdRise" || ph === "pdDive" ? { ph } : null;
}), 30000);
check("pile-driver starts", pd.ok, `phase=${pd.value?.ph ?? "none"}`);
const pdDone = await poll(() => evalEngine(() => {
  const e = window.__engine;
  return e["slamPhase"] === "none" && e["cd"].slam > 0 ? { t: true } : null;
}), 120000);
check("pile-driver completes", pdDone.ok);

// --- city destruction: direct blast on a far intact tower verifies collapse + fires
await keepalive();
const demo1 = await evalEngine(() => window.__engine.city.demolished);
const target = await farTall();
const blastRes = await evalEngine((t) => {
  const e = window.__engine;
  const V = e.rig.group.position.constructor;
  return e.city.blast(new V(t.x, t.top - 10, t.z), 30, 99999, e.fx);
}, target);
check("building collapse registered", blastRes >= 1, `blast destroyed=${blastRes} @${target ? target.d + "m" : "?"} demolished ${demo1}→${await evalEngine(() => window.__engine.city.demolished)}`);

// --- fires burning in the rubble
const fires = await evalEngine(() => window.__engine.city.fires.length);
check("rubble fires lit", fires > 0, `fires=${fires}`);

// --- spawn all enemy kinds + boss; soak WITHOUT keepalive → damage pipeline live
// (clear invuln so the hero actually takes hits during the soak)
await evalEngine(() => { const e = window.__engine; e["iT"] = 0; });
await evalEngine(() => {
  const e = window.__engine;
  for (const k of ["seeker", "raptor", "gunship", "bomber", "mech", "boss"]) e["spawnAt"](k);
});
const hp0 = await evalEngine(() => Math.round(window.__engine["hp"]));
await page.waitForTimeout(25000);
const ai2 = await evalEngine((h0) => {
  const e = window.__engine;
  return {
    n: e.enemies.list.length,
    kinds: e.enemies.list.map((x) => x.kind + (x.dead ? "†" : "")).join(","),
    heroHp: Math.round(e["hp"]),
    score: e.hud.score,
    t: +e["t"].toFixed(1),
  };
}, hp0);
check("enemy menagerie simulating", ai2.n > 0, `n=${ai2.n} [${ai2.kinds}] gameT=${ai2.t}`);
check("hero damage pipeline live", ai2.heroHp < hp0 || ai2.heroHp <= 0, `hp ${hp0}→${ai2.heroHp}`);

// --- bomber payload: keepalive (mode must be "playing" or bombs never fall), far tower
await keepalive();
const demoB = await evalEngine(() => window.__engine.city.demolished);
const target2 = await farTall();
const bombDropped = await evalEngine((t) => {
  const e = window.__engine;
  const V = e.rig.group.position.constructor;
  // a stick of 3 bombs across the block, like a real bombing run
  e.dropBomb(new V(t.x, t.top + 8, t.z), new V(0, -4, 0));
  e.dropBomb(new V(t.x + 12, t.top + 14, t.z + 6), new V(0, -4, 0));
  e.dropBomb(new V(t.x - 10, t.top + 20, t.z - 8), new V(0, -4, 0));
  return true;
}, target2);
const bomb = await poll(() => evalEngine((d0) => window.__engine.city.demolished > d0 ? { d: window.__engine.city.demolished } : null, demoB), 150000);
check("bomber payload flattens a block", bombDropped && bomb.ok, `demolished ${demoB} → ${bomb.value?.d ?? demoB}`);

await launch.close();
console.log("======== RESULTS ========");
for (const r of results) console.log(r);
console.log("ERRORS:", errors.length);
for (const e of errors.slice(0, 15)) console.log("  " + e.slice(0, 240));
