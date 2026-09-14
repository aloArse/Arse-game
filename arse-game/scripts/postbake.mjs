// Post-process baked clips WITHOUT source FBX (works purely from anims.json):
//  1. impact-anchored sub-trims (cross, uppercut, cast1) for snappy combat timing
//  2. mirrored variants (punchM, punchFlurryM, uppercutM) for correct L/R sides
//  3. footfall phase offsets for walk/run/sprint (footstep FX sync)
// Run ONCE: node scripts/postbake.mjs   (refuses to run twice via meta.postbaked)
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

const buf = fs.readFileSync("src/assets/invincible.glb");
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const scene = gltf.scene;
scene.updateMatrixWorld(true);
const F = (n) => { let r = null; scene.traverse((o) => { if (!r && o.name === n) r = o; }); return r; };
const A = JSON.parse(fs.readFileSync("src/assets/anims.json", "utf8"));
if (A.meta && A.meta.postbaked) { console.error("REFUSING: anims.json already post-baked (meta.postbaked set)."); process.exit(1); }
fs.copyFileSync("src/assets/anims.json", "src/assets/anims.bak.json");
console.log("backup -> src/assets/anims.bak.json");

const bones = A.bones;
const restHips = F("Hips_01").position.clone();
function pose(clip, t) {
  const c = A.clips[clip];
  const tt = Math.min(Math.max(t, 0), c.dur - 1e-4);
  const f = (tt / c.dur) * (c.frames.length - 1);
  const i0 = Math.floor(f), i1 = Math.min(c.frames.length - 1, i0 + 1), u = f - i0;
  const F0 = c.frames[i0], F1 = c.frames[i1];
  const _a = new THREE.Quaternion(), _b = new THREE.Quaternion();
  bones.forEach((bn, bi) => {
    _a.set(F0[bi * 4], F0[bi * 4 + 1], F0[bi * 4 + 2], F0[bi * 4 + 3]);
    _b.set(F1[bi * 4], F1[bi * 4 + 1], F1[bi * 4 + 2], F1[bi * 4 + 3]);
    if (_a.dot(_b) < 0) { _b.x *= -1; _b.y *= -1; _b.z *= -1; _b.w *= -1; }
    F(bn).quaternion.set(_a.x + (_b.x - _a.x) * u, _a.y + (_b.y - _a.y) * u, _a.z + (_b.z - _a.z) * u, _a.w + (_b.w - _a.w) * u).normalize();
  });
  const H0 = c.hips[i0], H1 = c.hips[i1];
  F("Hips_01").position.set(
    restHips.x + H0[0] + (H1[0] - H0[0]) * u,
    restHips.y + H0[1] + (H1[1] - H0[1]) * u,
    restHips.z + H0[2] + (H1[2] - H0[2]) * u);
  scene.updateMatrixWorld(true);
}
const P = (n) => { const v = new THREE.Vector3(); F(n).getWorldPosition(v); return v; };
const track = (clip, bone, N = 40) => {
  const c = A.clips[clip], out = [];
  for (let i = 0; i <= N; i++) { pose(clip, (c.dur * i) / N); out.push(P(bone).clone()); }
  return out;
};

// ---- 1. impact-anchored sub-trims ----
function subtrim(name, a, b) {
  const c = A.clips[name];
  const n = c.frames.length;
  const i0 = Math.max(0, Math.round((a / c.dur) * (n - 1)));
  const i1 = Math.min(n - 1, Math.round((b / c.dur) * (n - 1)));
  if (i1 - i0 < 8) { console.error(`subtrim ${name} too short`); process.exit(1); }
  const frames = c.frames.slice(i0, i1 + 1);
  const hips = c.hips.slice(i0, i1 + 1);
  let sx0 = 1e9, sx1 = -1e9, sz0 = 1e9, sz1 = -1e9;
  for (const h of hips) { sx0 = Math.min(sx0, h[0]); sx1 = Math.max(sx1, h[0]); sz0 = Math.min(sz0, h[1]); sz1 = Math.max(sz1, h[1]); }
  A.clips[name] = { ...c, dur: Math.round(((i1 - i0) / 30) * 10000) / 10000, frames, hips,
    stride: Math.round(Math.hypot(sx1 - sx0, sz1 - sz0) * 10000) / 10000 };
  console.log(`subtrim ${name}: [${a.toFixed(2)},${b.toFixed(2)}] -> dur=${A.clips[name].dur}s (${frames.length}f)`);
}
{
  // cross: RightHand max forward speed = the cross impact
  const pts = track("cross", "handR_029", 60), c = A.clips.cross;
  let bi = 0, bv = 0;
  for (let i = 5; i < pts.length; i++) { const v = pts[i].distanceTo(pts[i - 1]); if (v > bv) { bv = v; bi = i; } }
  const impact = (bi / 60) * c.dur;
  console.log(`cross impact @${impact.toFixed(2)}s (dur ${c.dur}s)`);
  subtrim("cross", Math.max(0, impact - 0.2), Math.min(c.dur, impact + 0.45));
}
{
  // uppercut: RightHand LOWEST (windup) then max height after it = fist top
  const pts = track("uppercut", "handR_029", 60), cu = A.clips.uppercut;
  let lo = 0;
  pts.forEach((p, i) => { if (p.y < pts[lo].y) lo = i; });
  let bi = lo, by = -1e9;
  pts.forEach((p, i) => { if (i >= lo && p.y > by) { by = p.y; bi = i; } });
  const impact = (bi / 60) * cu.dur;
  console.log(`uppercut low @${((lo / 60) * cu.dur).toFixed(2)}s`);
  console.log(`uppercut top @${impact.toFixed(2)}s (dur ${cu.dur}s)`);
  subtrim("uppercut", Math.max(0, impact - 0.32), Math.min(cu.dur, impact + 0.35));
}
{
  // cast1: RightHand max forward = full extension
  const pts = track("cast1", "handR_029", 40), c1 = A.clips.cast1;
  let bi = 0, bz = -1e9;
  pts.forEach((p, i) => { const z = p.z - P("Hips_01").z; if (p.z > bz) { bz = p.z; bi = i; } void z; });
  const impact = (bi / 40) * c1.dur;
  console.log(`cast1 full-ext @${impact.toFixed(2)}s (dur ${c1.dur}s)`);
  subtrim("cast1", Math.max(0, impact - 0.3), Math.min(c1.dur, impact + 0.12));
}

// ---- 2. mirrors ----
const pairs = {}; // bone -> mirror partner
{
  // pair by STEM + side marker (numeric suffixes differ per side: thighL_045 <-> thighR_049)
  const byStem = {};
  for (const bn of bones) {
    const stem = bn.replace(/_\d+$/, "");
    if (byStem[stem]) { console.error(`ambiguous stem ${stem}`); process.exit(1); }
    byStem[stem] = bn;
  }
  for (const bn of bones) {
    const stem = bn.replace(/_\d+$/, "");
    const side = stem.endsWith("L") ? "L" : stem.endsWith("R") ? "R" : null;
    if (!side) { pairs[bn] = bn; continue; } // center bone: mirror in place
    const pstem = stem.slice(0, -1) + (side === "L" ? "R" : "L");
    if (!byStem[pstem]) { console.error(`no mirror partner for ${bn} (want ${pstem})`); process.exit(1); }
    pairs[bn] = byStem[pstem];
  }
}
const nCenter = bones.filter((b) => pairs[b] === b).length;
console.log(`mirror pairs ok: ${bones.length - nCenter} sided, ${nCenter} center (${bones.filter((b) => pairs[b] === b).join(",")})`);
const mirQ = ([x, y, z, w]) => [x, -y, -z, w]; // M=diag(-1,1,1) conjugation
function mirrorClip(src, dst) {
  const c = A.clips[src];
  const idx = {};
  bones.forEach((bn, bi) => { idx[bn] = bi; });
  const frames = c.frames.map((fr) => {
    const out = new Array(fr.length);
    bones.forEach((bn, bi) => {
      // dest bone bn gets mirrored source from partner bone's track
      const pb = pairs[bn];
      const pbi = idx[pb];
      const [x, y, z, w] = mirQ([fr[pbi * 4], fr[pbi * 4 + 1], fr[pbi * 4 + 2], fr[pbi * 4 + 3]]);
      out[bi * 4] = Math.round(x * 10000) / 10000; out[bi * 4 + 1] = Math.round(y * 10000) / 10000;
      out[bi * 4 + 2] = Math.round(z * 10000) / 10000; out[bi * 4 + 3] = Math.round(w * 10000) / 10000;
    });
    return out;
  });
  const hips = c.hips.map(([x, y, z]) => [-x, y, z]);
  A.clips[dst] = { ...c, frames, hips, mirroredFrom: src };
  console.log(`mirror ${src} -> ${dst} (${frames.length}f)`);
}
mirrorClip("punch", "punchM");
mirrorClip("punchFlurry", "punchFlurryM");
mirrorClip("uppercut", "uppercutM");

// ---- 3. footfall phases ----
const offsets = {};
for (const name of ["walk", "run", "sprint"]) {
  const c = A.clips[name], ph = {};
  for (const [toe, tag] of [["toeL_048", "L"], ["toeR_052", "R"]]) {
    // touchdown ~= front-most toe position in HIPS frame (robust for walk + run + sprint)
    const zs = [];
    for (let i = 0; i < 72; i++) {
      pose(name, (c.dur * i) / 72);
      const hq = F("Hips_01").getWorldQuaternion(new THREE.Quaternion()).invert();
      const rel = P(toe).sub(P("Hips_01")).applyQuaternion(hq);
      zs.push(rel.z);
    }
    let mi = 0;
    zs.forEach((z, i) => { if (z > zs[mi]) mi = i; });
    ph[tag] = mi / 72;
  }
  const sym = (((ph.R - ph.L) % 1) + 1) % 1;
  offsets[name] = { off: Math.round((((-ph.L % 1) + 1) % 1) * 1000) / 1000, sym: Math.round(sym * 1000) / 1000 };
  console.log(`${name}: strikeL=${ph.L.toFixed(2)} strikeR=${ph.R.toFixed(2)} sym=${sym.toFixed(2)} off=${offsets[name].off}`);
  if (Math.abs(sym - 0.5) > 0.12) { console.error(`ASYMMETRIC gait ${name}`); process.exit(1); }
}

A.meta = { postbaked: true, offsets };
fs.writeFileSync("src/assets/anims.json", JSON.stringify(A));
console.log("wrote src/assets/anims.json", (JSON.stringify(A).length / 1024).toFixed(0) + "KB, clips:", Object.keys(A.clips).length);
