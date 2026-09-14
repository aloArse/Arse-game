// Re-bakes ONLY the "flyM" clip from a new Mixamo FBX (e.g. Flying.fbx) and
// overwrites the existing "flyM" entry in src/assets/anims.json in place.
// Everything else in anims.json is left untouched.
//
// Usage:
//   1. Put Flying.fbx in /home/user/animsrc/  (same folder as the other Liam@*.fbx files)
//   2. node scripts/rebake-flyM.mjs
//
// Requires: node_modules with "three" installed (same deps as bake-anims.mjs / bake-add.mjs).
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
const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
const fs = await import("node:fs");

const SRC = "/home/user/animsrc/";
const FBX_FILE = "Flying.fbx"; // <- the file you uploaded
const r4 = (n) => Math.round(n * 10000) / 10000;

const FINGERS = [
  ["Thumb1", "thumb01"], ["Thumb2", "thumb02"], ["Thumb3", "thumb03"],
  ["Index1", "f_index01"], ["Index2", "f_index02"], ["Index3", "f_index03"],
  ["Middle1", "f_middle01"], ["Middle2", "f_middle02"], ["Middle3", "f_middle03"],
  ["Ring1", "f_ring01"], ["Ring2", "f_ring02"], ["Ring3", "f_ring03"],
  ["Pinky1", "f_pinky01"], ["Pinky2", "f_pinky02"], ["Pinky3", "f_pinky03"],
];
const MAP = {
  Hips: "Hips_01", Spine: "spine001_02", Spine1: "spine002_03", Spine2: "Chest_04",
  Neck: "NEck_05", Head: "Head_06",
  LeftShoulder: "shoulderL_07", LeftArm: "upper_armL_08", LeftForeArm: "forearmL_09", LeftHand: "handL_010",
  LeftUpLeg: "thighL_045", LeftLeg: "shinL_046", LeftFoot: "footL_047", LeftToeBase: "toeL_048",
  RightShoulder: "shoulderR_026", RightArm: "upper_armR_027", RightForeArm: "forearmR_028", RightHand: "handR_029",
  RightUpLeg: "thighR_049", RightLeg: "shinR_050", RightFoot: "footR_051", RightToeBase: "toeR_052",
};
for (const [m, h] of FINGERS) {
  MAP[`LeftHand${m}`] = `${h}L_${m.startsWith("Thumb") ? "014" : m.startsWith("Index") ? "011" : m.startsWith("Middle") ? "017" : m.startsWith("Ring") ? "020" : "023"}`;
  MAP[`RightHand${m}`] = `${h}R_${m.startsWith("Thumb") ? "033" : m.startsWith("Index") ? "030" : m.startsWith("Middle") ? "036" : m.startsWith("Ring") ? "039" : "042"}`;
}
const FINGER_SUFFIX = {
  L: { Thumb1: "014", Thumb2: "015", Thumb3: "016", Index1: "011", Index2: "012", Index3: "013", Middle1: "017", Middle2: "018", Middle3: "019", Ring1: "020", Ring2: "021", Ring3: "022", Pinky1: "023", Pinky2: "024", Pinky3: "025" },
  R: { Thumb1: "033", Thumb2: "034", Thumb3: "035", Index1: "030", Index2: "031", Index3: "032", Middle1: "036", Middle2: "037", Middle3: "038", Ring1: "039", Ring2: "040", Ring3: "041", Pinky1: "042", Pinky2: "043", Pinky3: "044" },
};
const FINGER_STEM = { Thumb: "thumb", Index: "f_index", Middle: "f_middle", Ring: "f_ring", Pinky: "f_pinky" };
for (const side of ["L", "R"]) {
  for (const [f, stem] of Object.entries(FINGER_STEM)) {
    for (const j of [1, 2, 3]) {
      const m = `${side === "L" ? "Left" : "Right"}Hand${f}${j}`;
      MAP[m] = `${stem}0${j}${side}_${FINGER_SUFFIX[side][`${f}${j}`]}`;
    }
  }
}

// name, file, trim, root policy, loop -- same settings the old flyM used
const CLIPS = [
  ["flyM", FBX_FILE, null, "y", true],
];

function loadGLB(path) {
  const buf = fs.readFileSync(path);
  return new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
}
function loadFBX(path) {
  const buf = fs.readFileSync(path);
  return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
}

const hero = (await loadGLB("src/assets/invincible.glb")).scene;
hero.updateMatrixWorld(true);
const H = (n) => { let r = null; hero.traverse((o) => { if (!r && o.name === n) r = o; }); return r; };
const heroRest = {};
hero.traverse((o) => { if (o.isBone) heroRest[o.name] = o.getWorldQuaternion(new THREE.Quaternion()); });
const heroRestPos = {};
hero.traverse((o) => { if (o.isBone) heroRestPos[o.name] = o.getWorldPosition(new THREE.Vector3()); });
const heroParent = {};
{
  const bib = {};
  hero.traverse((o) => { if (o.isBone) bib[o.name] = o; });
  for (const bn of Object.values(MAP)) {
    let p = bib[bn].parent;
    while (p && !p.isBone) p = p.parent;
    heroParent[bn] = p && Object.values(MAP).includes(p.name) ? p.name : null;
  }
}
const ORDER = [];
{
  const kids = {};
  for (const [c, p] of Object.entries(heroParent)) { if (p) (kids[p] = kids[p] || []).push(c); }
  const q = ["Hips_01"];
  while (q.length) { const b = q.shift(); ORDER.push(b); for (const k of kids[b] || []) q.push(k); }
}
console.log("mapped bones:", Object.keys(MAP).length, "| order len:", ORDER.length);
const missingHero = Object.values(MAP).filter((bn) => !H(bn));
if (missingHero.length) { console.log("MISSING HERO BONES:", missingHero.join(",")); process.exit(1); }
const heroHipsY = heroRestPos["Hips_01"].y;
const hipsParentWorld = heroRest["Hips_01"].clone().multiply(H("Hips_01").quaternion.clone().invert());

const A0 = JSON.parse(fs.readFileSync("src/assets/anims.json", "utf8"));
if (JSON.stringify(A0.bones) !== JSON.stringify(ORDER)) { console.error("BONE ORDER MISMATCH - aborting"); process.exit(1); }
const out = A0;
const FPS = 30;

// NOTE: this Flying.fbx uses "mixamorig:Name" (with colon) bone names, unlike the
// original Liam@*.fbx sources which used "mixamorigName" (no colon). Match both.
function findSrcBone(obj, n) {
  let r = null;
  obj.traverse((o) => { if (!r && (o.name === `mixamorig${n}` || o.name === `mixamorig:${n}`)) r = o; });
  return r;
}

async function bakeClip(name, file, trim, rootPolicy, loop) {
  const obj = loadFBX(SRC + file);
  const clip = obj.animations[0];
  const S = (n) => findSrcBone(obj, n);
  const missing = Object.keys(MAP).filter((m) => !S(m));
  if (missing.length) { console.log(`  ${name}: MISSING SRC BONES:`, missing.join(",")); process.exit(1); }
  obj.updateMatrixWorld(true);
  const srcRest = {};
  obj.traverse((o) => { if (o.isBone) srcRest[o.name] = o.getWorldQuaternion(new THREE.Quaternion()); });
  const srcHipsRest = S("Hips").position.clone();
  const s = heroHipsY / (srcHipsRest.y / 100);
  const [t0, t1] = trim || [0, clip.duration];
  const dur = t1 - t0;
  const n = Math.max(2, Math.round(dur * FPS) + 1);
  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(clip).play();
  const frames = [];
  const hipsTrack = [];
  const rawHips = [];
  const W = {};
  for (let i = 0; i < n; i++) {
    mixer.setTime(Math.min(t0 + (dur * i) / (n - 1), clip.duration - 0.0005));
    obj.updateMatrixWorld(true);
    const fq = [];
    for (const hb of ORDER) {
      const m = Object.keys(MAP).find((k) => MAP[k] === hb);
      const sb = S(m);
      const wAnim = sb.getWorldQuaternion(new THREE.Quaternion());
      const Sdelta = wAnim.multiply(srcRest[sb.name].clone().invert());
      const wTgt = Sdelta.multiply(heroRest[hb]);
      W[hb] = wTgt;
      const parent = heroParent[hb];
      const wPar = parent ? W[parent] : null;
      let ql;
      if (!parent) {
        ql = hipsParentWorld.clone().invert().multiply(wTgt);
      } else {
        ql = wPar.clone().invert().multiply(wTgt);
      }
      if (Math.abs(ql.length() - 1) > 0.002) { console.error(`NON-UNIT ${name} f=${i} ${hb} n=${ql.length()}`); process.exit(1); }
      fq.push(r4(ql.x), r4(ql.y), r4(ql.z), r4(ql.w));
    }
    frames.push(fq);
    const hp = S("Hips").position.clone().sub(srcHipsRest).divideScalar(100).multiplyScalar(s);
    rawHips.push([hp.x, hp.z]);
    let hx = 0, hy = 0, hz = 0;
    if (rootPolicy === "all") { hx = hp.x; hy = hp.y; hz = hp.z; }
    else if (rootPolicy === "y") { hy = hp.y; }
    hipsTrack.push([r4(hx), r4(hy), r4(hz)]);
  }
  let sx0 = 1e9, sx1 = -1e9, sz0 = 1e9, sz1 = -1e9;
  for (const h of rawHips) { sx0 = Math.min(sx0, h[0]); sx1 = Math.max(sx1, h[0]); sz0 = Math.min(sz0, h[1]); sz1 = Math.max(sz1, h[1]); }
  let snap = 0;
  if (loop) {
    const a = frames[0], b = frames[n - 1];
    for (let j = 0; j < a.length; j += 4) {
      const qa = new THREE.Quaternion(a[j], a[j + 1], a[j + 2], a[j + 3]);
      const qb = new THREE.Quaternion(b[j], b[j + 1], b[j + 2], b[j + 3]);
      snap = Math.max(snap, qa.angleTo(qb) * 57.3);
    }
  }
  out.clips[name] = { dur: r4(dur), fps: FPS, loop, root: rootPolicy, stride: r4(Math.hypot(sx1 - sx0, sz1 - sz0)), snap: r4(snap), frames, hips: hipsTrack };
  console.log(`  ${name}: ${n} frames, dur=${dur.toFixed(2)}s, stride=${Math.hypot(sx1 - sx0, sz1 - sz0).toFixed(2)}m, snap=${snap.toFixed(1)}°`);
}

for (const [name, file, trim, root, loop] of CLIPS) await bakeClip(name, file, trim, root, loop);

fs.writeFileSync("src/assets/anims.json", JSON.stringify(out));
console.log("wrote src/assets/anims.json", (JSON.stringify(out).length / 1024).toFixed(0) + "KB");
