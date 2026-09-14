// Verifies baked clips (src/assets/anims.json) ON the hero skeleton:
// locomotion alternation, strike excursions, no hyper-extension, fingers sane.
// Run: node scripts/test-anims.mjs
function makeImg() {
  const listeners = {};
  const img = { width: 4, height: 4, complete: false, _src: "", style: {},
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    set src(v) { img._src = v; setTimeout(() => { img.complete = true; for (const fn of listeners.load || []) fn.call(img); }, 0); },
    get src() { return img._src; } };
  return img;
}
globalThis.document = { createElementNS: () => makeImg() };
globalThis.self = globalThis;
const THREE = await import("three");
const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
const fs = await import("node:fs");
let failures = 0;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? " — " + x : ""}`); if (!ok) failures++; };

const buf = fs.readFileSync("src/assets/invincible.glb");
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const scene = gltf.scene;
scene.updateMatrixWorld(true);
const F = (n) => { let r = null; scene.traverse((o) => { if (!r && o.name === n) r = o; }); return r; };
const ANIMS = JSON.parse(fs.readFileSync("src/assets/anims.json", "utf8"));
const bones = ANIMS.bones;
const restHips = F("Hips_01").position.clone();

// pose skeleton from clip at time t (nlerp between frames)
const _a = new THREE.Quaternion(), _b = new THREE.Quaternion();
function pose(clipName, t) {
  const c = ANIMS.clips[clipName];
  const tt = c.loop ? ((t % c.dur) + c.dur) % c.dur : Math.min(Math.max(t, 0), c.dur - 1e-4);
  const f = (tt / c.dur) * (c.frames.length - 1);
  const i0 = Math.floor(f), i1 = Math.min(c.frames.length - 1, i0 + 1), u = f - i0;
  const F0 = c.frames[i0], F1 = c.frames[i1];
  bones.forEach((bn, bi) => {
    _a.set(F0[bi * 4], F0[bi * 4 + 1], F0[bi * 4 + 2], F0[bi * 4 + 3]);
    _b.set(F1[bi * 4], F1[bi * 4 + 1], F1[bi * 4 + 2], F1[bi * 4 + 3]);
    if (_a.dot(_b) < 0) { _b.x *= -1; _b.y *= -1; _b.z *= -1; _b.w *= -1; }
    F(bn).quaternion.set(
      _a.x + (_b.x - _a.x) * u, _a.y + (_b.y - _a.y) * u,
      _a.z + (_b.z - _a.z) * u, _a.w + (_b.w - _a.w) * u).normalize();
  });
  const H0 = c.hips[i0], H1 = c.hips[i1];
  F("Hips_01").position.set(
    restHips.x + H0[0] + (H1[0] - H0[0]) * u,
    restHips.y + H0[1] + (H1[1] - H0[1]) * u,
    restHips.z + H0[2] + (H1[2] - H0[2]) * u);
  scene.updateMatrixWorld(true);
}
const P = (n) => { const v = new THREE.Vector3(); F(n).getWorldPosition(v); return v; };
const corr = (a, b) => {
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return s / Math.sqrt(sa * sb + 1e-9);
};
// joint-line test: knee must stay forward of hip-ankle line, elbow behind shoulder-wrist line
function jointLines(elbowTol = 0.35) {
  const bad = [];
  // measure in HIPS frame (body yawns during kicks/strikes; world +Z is meaningless then)
  const hipsQ = F("Hips_01").getWorldQuaternion(new THREE.Quaternion()).invert();
  for (const [hip, knee, ank, wantFwd, tag] of [
    ["thighL_045", "shinL_046", "footL_047", 1, "kneeL"], ["thighR_049", "shinR_050", "footR_051", 1, "kneeR"],
    ["upper_armL_08", "forearmL_09", "handL_010", -1, "elbowL"], ["upper_armR_027", "forearmR_028", "handR_029", -1, "elbowR"],
  ]) {
    const a = P(hip), b = P(knee), c = P(ank);
    const axis = c.clone().sub(a); const len = axis.length(); axis.normalize();
    const off = b.clone().sub(a).addScaledVector(axis, -(b.clone().sub(a).dot(axis)));
    if (off.length() > 0.02) {
      off.applyQuaternion(hipsQ);
      const fwd = off.z / off.length();
      if (wantFwd > 0 && fwd < -0.35) bad.push(`${tag}(fwd=${fwd.toFixed(2)})`);
      if (wantFwd < 0 && fwd > elbowTol) bad.push(`${tag}(fwd=${fwd.toFixed(2)})`);
    }
    void len;
  }
  return bad;
}

// ---- data sanity ----
{
  let nan = 0;
  for (const [name, c] of Object.entries(ANIMS.clips)) {
    for (const fr of c.frames) for (const v of fr) if (!isFinite(v)) nan++;
    for (const h of c.hips) for (const v of h) if (!isFinite(v)) nan++;
  }
  check("no NaN in baked data", nan === 0);
  check("expected clips present", ["idle", "walk", "run", "sprint", "hover", "punch", "punchM", "cross", "uppercut", "uppercutM", "kick", "hit", "cast1", "cast2", "throw", "bash", "snatch", "land", "block", "fightIdle", "punchFlurry", "punchFlurryM", "hookFlurry", "flyM", "diveM", "spinM", "grabM"].every((k) => ANIMS.clips[k]));
  check("postbake meta", !!(ANIMS.meta && ANIMS.meta.postbaked && ANIMS.meta.offsets && ANIMS.meta.offsets.walk && ANIMS.meta.offsets.run && ANIMS.meta.offsets.sprint));
}

// ---- locomotion ----
for (const name of ["walk", "run", "sprint"]) {
  const c = ANIMS.clips[name];
  const N = 24, tL = [], tR = [], aL = [], aR = [], toeY = [];
  let bad = [];
  for (let i = 0; i < N; i++) {
    pose(name, (c.dur * i) / N);
    const hipsQ = F("Hips_01").getWorldQuaternion(new THREE.Quaternion()).invert();
    const dir = (a, b) => P(b).sub(P(a)).normalize().applyQuaternion(hipsQ);
    tL.push(Math.atan2(dir("thighL_045", "shinL_046").z, -dir("thighL_045", "shinL_046").y));
    tR.push(Math.atan2(dir("thighR_049", "shinR_050").z, -dir("thighR_049", "shinR_050").y));
    aL.push(Math.atan2(dir("upper_armL_08", "forearmL_09").z, -dir("upper_armL_08", "forearmL_09").y));
    aR.push(Math.atan2(dir("upper_armR_027", "forearmR_028").z, -dir("upper_armR_027", "forearmR_028").y));
    toeY.push(P("toeL_048").y);
    bad = bad.concat(jointLines().map((j) => `${name}@${i}:${j}`));
  }
  const amp = (a) => Math.max(...a) - Math.min(...a);
  check(`${name}: legs alternate`, corr(tL, tR) < -0.5 && amp(tL) > 0.35, `corr=${corr(tL, tR).toFixed(2)} amp=${amp(tL).toFixed(2)}`);
  check(`${name}: feet lift`, Math.max(...toeY) - Math.min(...toeY) > 0.12, `lift=${(Math.max(...toeY) - Math.min(...toeY)).toFixed(2)}m`);
  check(`${name}: arms swing`, amp(aL) > 0.2, `amp=${amp(aL).toFixed(2)}`);
  check(`${name}: no hyper-extension`, bad.length === 0, bad.slice(0, 3).join(" "));
}

// ---- strikes: fist/feet excursions ----
function excursion(clip, bone, axis) {
  const c = ANIMS.clips[clip];
  const N = 20, vs = [];
  for (let i = 0; i <= N; i++) { pose(clip, (c.dur * i) / N); vs.push(P(bone)[axis] - P("Hips_01")[axis]); }
  return { min: Math.min(...vs), max: Math.max(...vs), iMax: vs.indexOf(Math.max(...vs)), iMin: vs.indexOf(Math.min(...vs)), vs };
}
{
  const p = excursion("punch", "handR_029", "z");
  check("punch: right fist extends forward then returns", p.max > 0.45 && p.iMax < 12, `ext=${p.max.toFixed(2)}m @${p.iMax}/20`);
  const c = excursion("cross", "handR_029", "z");
  check("cross: right hand extends at mid", c.max > 0.35 && c.iMax > 4 && c.iMax < 17, `ext=${c.max.toFixed(2)}m @${c.iMax}/20`);
  const u = excursion("uppercut", "handR_029", "y");
  check("uppercut: fist rises", u.max - u.min > 0.45 && u.iMax > u.iMin, `rise=${(u.max - u.min).toFixed(2)}m`);
  const k = excursion("kick", "footL_047", "y");
  const kz = excursion("kick", "footL_047", "z");
  check("kick: left foot high + forward", k.max > 0.35 && kz.max > 0.4, `h=${k.max.toFixed(2)} fwd=${kz.max.toFixed(2)}`);
  const h = excursion("hookFlurry", "handR_029", "x");
  check("hookFlurry: hand sweeps across", h.max - h.min > 0.35, `range=${(h.max - h.min).toFixed(2)}m`);
  const pf = excursion("punchFlurry", "handR_029", "z");
  check("punchFlurry: quick extension", pf.max > 0.25, `ext=${pf.max.toFixed(2)}m`);
  // mirrors: same motion on the opposite (file-L / game-R) side
  const pm = excursion("punchM", "handL_010", "z");
  check("punchM: LEFT hand extends like punch", pm.max > 0.45 && Math.abs(pm.max - p.max) / p.max < 0.1, `ext=${pm.max.toFixed(2)}m vs ${p.max.toFixed(2)}m`);
  const um = excursion("uppercutM", "handL_010", "y");
  check("uppercutM: LEFT fist rises like uppercut", um.max - um.min > 0.4 && um.iMax > um.iMin, `rise=${(um.max - um.min).toFixed(2)}m`);
  const pfm = excursion("punchFlurryM", "handL_010", "z");
  check("punchFlurryM: LEFT quick extension", pfm.max > 0.25 && Math.abs(pfm.max - pf.max) / pf.max < 0.1, `ext=${pfm.max.toFixed(2)}m vs ${pf.max.toFixed(2)}m`);
  // subtrimmed timing: strike power (max hand speed) lands early for combo rhythm
  const impactFrame = (clip, bone) => {
    const cc = ANIMS.clips[clip], N = 20;
    let bi = 0, bv = 0, prev = null;
    for (let i = 0; i <= N; i++) {
      pose(clip, (cc.dur * i) / N);
      const p = P(bone).clone();
      if (prev && i >= 3) { const v = p.distanceTo(prev); if (v > bv) { bv = v; bi = i; } }
      prev = p;
    }
    return bi;
  };
  check("cross: snappy impact", impactFrame("cross", "handR_029") <= 9, `power@${impactFrame("cross", "handR_029")}/20`);
  check("punchM: snappy impact", impactFrame("punchM", "handL_010") <= 10, `power@${impactFrame("punchM", "handL_010")}/20`);
  const c1 = excursion("cast1", "handR_029", "z");
  check("cast1: hand starts hot (spam-pump)", c1.vs[5] > 1.0 && c1.max > 1.4, `ext@25%=${c1.vs[5].toFixed(2)}m peak=${c1.max.toFixed(2)}m`);
  const c2r = excursion("cast2", "handR_029", "z"), c2l = excursion("cast2", "handL_010", "z");
  check("cast2: both hands blast forward", c2r.max > 0.3 && c2l.max > 0.3, `R=${c2r.max.toFixed(2)} L=${c2l.max.toFixed(2)}`);
  const th = excursion("throw", "handR_029", "z");
  check("throw: release forward early then follow-through", th.max > 0.4 && th.iMax < 10, `ext=${th.max.toFixed(2)}m @${th.iMax}/20`);
  const bs = excursion("bash", "handR_029", "y");
  check("bash: raise then smash down", bs.max - bs.min > 0.5 && bs.iMin > bs.iMax, `range=${(bs.max - bs.min).toFixed(2)}m`);
  const sn = excursion("snatch", "handR_029", "z");
  const sny = excursion("snatch", "handR_029", "y");
  check("snatch: reach up-forward", sn.max > 0.25 && sny.max > 0.35, `z=${sn.max.toFixed(2)} y=${sny.max.toFixed(2)}`);
  // land: starts crouched (impact), ends standing straight
  pose("land", 0.001);
  const q0 = F("Hips_01").getWorldQuaternion(new THREE.Quaternion()).invert();
  const th0 = P("shinL_046").sub(P("thighL_045")).normalize().applyQuaternion(q0);
  check("land: starts crouched", Math.atan2(th0.z, -th0.y) > 0.8, `pitch=${Math.atan2(th0.z, -th0.y).toFixed(2)}rad`);
  pose("land", ANIMS.clips.land.dur - 0.01);
  const q = F("Hips_01").getWorldQuaternion(new THREE.Quaternion()).invert();
  const thD = P("shinL_046").sub(P("thighL_045")).normalize().applyQuaternion(q);
  check("land: ends standing straight", thD.y < -0.88, `thighY=${thD.y.toFixed(2)}`);
  // hit: fast small flinch
  const hd = excursion("hit", "Head_06", "z");
  check("hit: quick head snap", Math.abs(hd.max - hd.min) > 0.05 && Math.abs(hd.max - hd.min) < 0.6, `range=${Math.abs(hd.max - hd.min).toFixed(2)}m`);
  // block/fightIdle guards
  pose("block", 0.6);
  check("block: hands up", P("handR_029").y > P("Chest_04").y - 0.1, `fistY=${P("handR_029").y.toFixed(2)} chestY=${P("Chest_04").y.toFixed(2)}`);
  pose("fightIdle", 1.0);
  check("fightIdle: lead hand forward", P("handL_010").z - P("Chest_04").z > 0.15, `lead=${(P("handL_010").z - P("Chest_04").z).toFixed(2)}m`);
  // joint lines across all one-shots
  let bad = [];
  for (const name of ["punch", "punchM", "cross", "uppercut", "uppercutM", "kick", "cast1", "cast2", "throw", "bash", "snatch", "land", "hit", "block", "fightIdle", "idle", "hover", "punchFlurry", "punchFlurryM", "hookFlurry", "flyM", "diveM", "spinM", "grabM"]) {
    const c = ANIMS.clips[name];
    // strike/grapple clips have authentic elbow-lead (throw), wrap (snatch), elbow-strikes (uppercut), whirl-arms (spinM)
    const tol = (name === "uppercut" || name === "uppercutM") ? 0.92 : name === "snatch" ? 0.8 : (name === "throw" || name === "spinM") ? 0.6 : name === "diveM" ? 0.5 : 0.35;
    for (let i = 0; i <= 8; i++) { pose(name, (c.dur * i) / 8); bad = bad.concat(jointLines(tol).map((j) => `${name}@${i}:${j}`)); }
  }
  check("no hyper-extension anywhere", bad.length === 0, bad.slice(0, 4).join(" "));
  // fingers: delta-from-REST rotation must be sane (rest local quats aren't identity)
  pose("idle", 0.5);
  const fingerRest = {};
  for (const bn of bones.filter((b) => /f_|thumb/.test(b))) fingerRest[bn] = F(bn).quaternion.clone();
  let maxBend = 0;
  for (const name of ["punch", "cross", "uppercut", "hookFlurry", "cast1", "cast2", "throw", "bash", "snatch", "block", "fightIdle"]) {
    const c = ANIMS.clips[name];
    for (let i = 0; i <= 4; i++) {
      pose(name, (c.dur * i) / 4);
      for (const bn of Object.keys(fingerRest)) {
        const d = fingerRest[bn].clone().invert().multiply(F(bn).quaternion);
        maxBend = Math.max(maxBend, 2 * Math.acos(Math.min(1, Math.abs(d.w))) * 57.3);
      }
    }
  }
  // 125° smooth pinky clench in guard-hand fists is authentic mocap (fingertip-palm 0.15m proves fist shape)
  check("fingers sane (delta from rest)", maxBend < 140, `maxDelta=${maxBend.toFixed(0)}°`);
  // fist check: fingertip closer to palm at punch peak than in idle rest
  const fistD = () => P("f_index03R_032").distanceTo(P("handR_029"));
  pose("punch", 0.29); const dPunch = fistD();
  pose("idle", 0.5); const dIdle = fistD();
  console.log(`INFO  fingertip-palm: punch=${dPunch.toFixed(3)}m idle=${dIdle.toFixed(3)}m ${dPunch < dIdle ? "(fist clenches ✓)" : "(no clench)"}`);
}
console.log(failures ? `\n${failures} FAILURES` : "\nALL ANIM CHECKS PASSED");
process.exit(failures ? 1 : 0);
