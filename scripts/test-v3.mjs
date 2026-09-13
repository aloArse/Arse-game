// v3 feature tests: gouge point-destruction, walking, vision, bolt, backfist, stomp, portrait
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
await page.locator("text=START MISSION").first().click({ timeout: 15000 });
await page.waitForTimeout(3000);
const check = (name, ok, extra = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
const keepalive = () => page.evaluate(() => { const e = window.__engine; e["hp"] = 1000; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing"; });

// ---------- 1) GOUGE: point destruction ----------
const g1 = await page.evaluate(() => {
  const e = window.__engine;
  const b = e.city.buildings.find((x) => x.alive && x.top > 80 && x.slabs.length >= 8);
  const V = e.rig.group.position.constructor;
  const info = { top0: b.top, hp0: Math.round(b.hp), slabs: b.slabs.length, demolished0: e.city.demolished };
  // single fist-sized punch at the top floor
  const hit = new V(b.x, b.top - 4, b.z);
  const destroyed = e.city.gouge(hit, 2.6, e.fx, 26, 4);
  info.destroyed = destroyed;
  info.topAfter = b.top;
  info.aliveAfter = b.alive;
  info.demolishedAfter = e.city.demolished;
  return info;
});
check("gouge: point-only destruction", g1.destroyed >= 1 && g1.destroyed <= 4 && g1.aliveAfter && g1.demolishedAfter === g1.demolished0,
  `slabs=${g1.slabs} destroyed=${g1.destroyed} top ${g1.top0.toFixed(0)}→${g1.topAfter.toFixed(0)} alive=${g1.aliveAfter}`);

// repeated gouging eventually collapses it
const g2 = await page.evaluate(() => {
  const e = window.__engine;
  const b = e.city.buildings.find((x) => x.alive && x.top > 60 && x.slabs.length >= 8);
  const V = e.rig.group.position.constructor;
  let iters = 0;
  while (b.alive && iters < 60) {
    // carve the base out — real demolition work
    e.city.gouge(new V(b.x, 12 + (iters % 3) * 12, b.z), 4.5, e.fx, 30, 5);
    iters++;
  }
  return { iters, collapsed: !b.alive, hp: Math.round(b.hp) };
});
check("gouge: collapse when critical", g2.collapsed, `collapsed after ${g2.iters} hits`);

// ---------- 2) WALKING ----------
const spot = await page.evaluate(() => {
  const e = window.__engine;
  for (let x = -200; x < 200; x += 40) for (let z = -200; z < 200; z += 40) {
    if (e.city.surfaceY(x, z) === 0) return { x, z };
  }
  return { x: 0, z: 0 };
});
const w1 = await page.evaluate((s) => {
  const e = window.__engine;
  e["pos"].set(s.x, 3, s.z); // just above an open street cell
  e["vel"].set(0, -5, 0);
  e["cruise"] = 0;
  return true;
}, spot);
await page.keyboard.down("KeyC");
await page.waitForTimeout(9000);
await page.keyboard.up("KeyC");
await page.waitForTimeout(2000);
const w2 = await page.evaluate(() => {
  const e = window.__engine;
  return { grounded: !!e["grounded"], y: +e["pos"].y.toFixed(1), vy: +e["vel"].y.toFixed(1) };
});
check("landing → grounded", w2.grounded && w2.y < 3.5, JSON.stringify(w2));
// walk forward
await page.keyboard.down("KeyW");
await page.waitForTimeout(9000);
const w3 = await page.evaluate(() => {
  const e = window.__engine;
  return { grounded: !!e["grounded"], spd: Math.round(Math.hypot(e["vel"].x, e["vel"].z)), y: +e["pos"].y.toFixed(1) };
});
await page.keyboard.up("KeyW");
check("walking on ground", w3.grounded && w3.spd > 4 && w3.y < 4, `speed=${w3.spd} y=${w3.y}`);
// take off
await page.keyboard.down("Space");
await page.waitForTimeout(3000);
await page.keyboard.up("Space");
await page.waitForTimeout(1500);
const w4 = await page.evaluate(() => ({ grounded: !!window.__engine["grounded"], y: +window.__engine["pos"].y.toFixed(1) }));
check("takeoff from ground", !w4.grounded && w4.y > 6, JSON.stringify(w4));

// ---------- 3) STOMP (grounded slam) ----------
const s1 = await page.evaluate((s) => {
  const e = window.__engine;
  e["pos"].set(s.x + 20, 3, s.z + 20);
  e["vel"].set(0, -5, 0);
  e["cruise"] = 0;
  return true;
}, spot);
await page.keyboard.down("KeyC");
await page.waitForTimeout(8000);
await page.keyboard.up("KeyC");
await page.waitForTimeout(2000);
const st = await page.evaluate(() => {
  const e = window.__engine;
  return { grounded: !!e["grounded"], phase: e["slamPhase"] };
});
if (st.grounded) {
  const d0 = await page.evaluate(() => window.__engine.city.demolished);
  await page.keyboard.press("KeyL");
  await page.waitForTimeout(5000);
  const s2 = await page.evaluate(() => ({
    phase: window.__engine["slamPhase"],
    cd: +window.__engine["cd"].slam.toFixed(1),
    demolished: window.__engine.city.demolished,
  }));
  check("ground stomp shockwave", (s2.phase === "none" && s2.cd > 0) || s2.phase === "stomp", `phase=${s2.phase} cd=${s2.cd} demo ${d0}→${s2.demolished}`);
} else {
  check("ground stomp shockwave", false, `not grounded: ${JSON.stringify(st)}`);
}

// ---------- 4) VISION ----------
await keepalive();
await page.evaluate(() => { window.__engine["en"] = 100; });
const en0 = await page.evaluate(() => window.__engine["en"]);
await page.keyboard.down("KeyV");
await page.waitForTimeout(6000);
const v1 = await page.evaluate(() => ({ en: +window.__engine["en"].toFixed(1), beam: !!window.__engine["beam"]?.visible, eyeGlow: true }));
await page.keyboard.up("KeyV");
await page.waitForTimeout(2500);
const v2 = await page.evaluate(() => ({ beamVisible: !!window.__engine["beam"]?.visible }));
check("atomic vision fires + drains energy", v1.en < en0 - 4 && v1.beam && !v2.beamVisible, `en ${en0.toFixed(0)}→${v1.en} beam=${v1.beam} offAfter=${!v2.beamVisible}`);

// ---------- 5) BOLT ----------
await keepalive();
await page.keyboard.press("KeyT");
await page.waitForTimeout(1500);
const b1 = await page.evaluate(() => ({ cd: +window.__engine["cd"].bolt.toFixed(1), hud: +window.__engine.hud.cds.bolt.toFixed(1) }));
check("thunder strike", b1.cd > 5 && b1.hud > 5, `cd=${b1.cd}`);

// ---------- 6) BACKFIST: 4-hit chain ----------
await keepalive();
let sawStep3 = false;
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => { const e = window.__engine; e["cd"].strike = 0; e["hp"] = 1000; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing"; });
  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyJ");
  for (let k = 0; k < 6; k++) {
    await page.waitForTimeout(450);
    const st = await page.evaluate(() => ({ step: window.__engine["comboStep"], spin: +window.__engine["spinT"].toFixed(2) }));
    if (st.step === 3 || st.spin > 0) sawStep3 = true;
  }
}
check("4-hit chain w/ spin backfist", sawStep3, sawStep3 ? "4th hit observed" : "chain never reached step 3");

// ---------- 7) PORTRAIT MODE ----------
const p = await launch.newPage({ viewport: { width: 270, height: 480 } });
p.on("pageerror", (e) => errors.push("[portrait] " + e.message));
await p.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(9000);
await p.locator("text=START MISSION").first().click({ timeout: 15000 });
await p.waitForTimeout(5000);
const pr = await p.evaluate(() => {
  const e = window.__engine;
  const btns = document.querySelectorAll("button[aria-label]").length;
  return { mode: e.mode, buttons: btns, fov: +e.hud.spd.toFixed(0) };
});
const prOk = pr.mode === "playing" && pr.buttons >= 12;
check("portrait mode runs", prOk, `mode=${pr.mode} buttons=${pr.buttons}`);
await p.close();

check("zero page errors", errors.length === 0, `${errors.length}`);
for (const e of errors.slice(0, 6)) console.log("  " + e.slice(0, 200));
await launch.close();
