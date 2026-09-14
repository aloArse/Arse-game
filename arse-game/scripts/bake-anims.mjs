// Bakes retargeted animation clips for the hero (Mixamo FBX -> hero skeleton).
// Run: node scripts/bake-anims.mjs   (output: src/assets/anims.json)
// Math: per-frame world-delta transfer, root->leaves:
//   S = Wsrc_anim * Wsrc_rest^-1 ; Wtgt = S * Wtgt_rest ; qlocal = Wparent_anim^-1 * Wtgt
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
const r4 = (n) => Math.round(n * 10000) / 10000;

// mixamo -> hero (GLB sanitized names). Anatomical: mixamo Left = +X = hero L. No swap.
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
// fix finger suffixes: file names are f_index01L_011, f_index02L_012, f_index03L_013 (per-joint suffix)
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

// name, file, trim, root policy, loop
const CLIPS = [
  ["idle", "Liam@idle.fbx", null, "y", true],
  ["walk", "Liam@walking.fbx", null, "y", true],
  ["run", "Liam@running.fbx", null, "y", true],
  ["sprint", "Liam@Standing_Sprint_Forward.fbx", null, "y", true],
  ["fightIdle", "Liam@fight_idle.fbx", null, "y", true],
  ["block", "Liam@blocking.fbx", null, "y", true],
  ["punch", "Liam@punching.fbx", [0, 0.87], "all", false],
  ["punchFlurry", "Liam@punching.fbx", [0.05, 0.45], "all", false],
  ["cross", "Liam@cross_punch.fbx", [0.55, 1.75], "all", false],
  ["hookFlurry", "Liam@hook_punch.fbx", [0.65, 1.15], "all", false],
  ["uppercut", "Liam@elbow_uppercut_combo.fbx", [1.05, 1.95], "all", false],
  ["kick", "Liam@mma_kick.fbx", [0.25, 1.0], "all", false],
  ["hit", "Liam@hit_reaction.fbx", null, "all", false],
  ["cast1", "Liam@Standing_1H_Magic_Attack_01.fbx", [0.8, 1.3], "all", false],
  ["cast2", "Liam@Standing_2H_Magic_Attack_01.fbx", [0.7, 2.0], "all", false],
  ["throw", "Liam@throw.fbx", [0.75, 1.5], "all", false],
  ["bash", "Liam@bash.fbx", [1.5, 2.4], "all", false],
  ["snatch", "Liam@grab_and_slam.fbx", [0.15, 1.15], "all", false],
  ["land", "Liam@landing.fbx", [0.9, 2.1], "none", false],
];

function loadGLB(path) {
  const buf = fs.readFileSync(path);
  return new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
}
function loadFBX(path) {
  const buf = fs.readFileSync(path);
  return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
}

// ---- hero rest reference ----
const hero = (await loadGLB("src/assets/invincible.glb")).scene;
hero.updateMatrixWorld(true);
const H = (n) => { let r = null; hero.traverse((o) => { if (!r && o.name === n) r = o; }); return r; };
const heroRest = {};
hero.traverse((o) => { if (o.isBone) heroRest[o.name] = o.getWorldQuaternion(new THREE.Quaternion()); });
const heroRestPos = {};
hero.traverse((o) => { if (o.isBone) heroRestPos[o.name] = o.getWorldPosition(new THREE.Vector3()); });
// hero parent chain (bone-name -> parent bone-name or null for Hips; wrappers resolved to rest world)
const heroParent = {};
{
  const bib = {};
  hero.traverse((o) => { if (o.isBone) bib[o.name] = o; });
  for (const bn of Object.values(MAP)) {
    let p = bib[bn].parent;
    while (p && !p.isBone) p = p.parent;
    // only mapped bones participate; anything else (e.g. _rootJoint) is static rest
    heroParent[bn] = p && Object.values(MAP).includes(p.name) ? p.name : null;
  }
}
// BFS order from Hips_01 over mapped bones
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
console.log("hero hips rest Y:", heroHipsY.toFixed(3));
// static parent-world rotation of Hips (wrapper chain): HipsWorld_rest * qlocal_rest^-1
const hipsParentWorld = heroRest["Hips_01"].clone().multiply(H("Hips_01").quaternion.clone().invert());
console.log("hipsParentWorld norm:", hipsParentWorld.length().toFixed(4));

const out = { bones: ORDER, clips: {} };
const FPS = 30;

async function bakeClip(name, file, trim, rootPolicy, loop) {
  const obj = loadFBX(SRC + file);
  const clip = obj.animations[0];
  const S = (n) => { let r = null; obj.traverse((o) => { if (!r && o.name === `mixamorig${n}`) r = o; }); return r; };
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
  const W = {}; // target anim world per bone (this frame)
  const tmpM = new THREE.Matrix4();
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
        // Hips: wrapper chain is static -> parent world = HipsWorld_rest * qlocal_rest^-1 (unit quats only!)
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
  // stride (RAW XZ travel over the trimmed cycle, before root stripping)
  let sx0 = 1e9, sx1 = -1e9, sz0 = 1e9, sz1 = -1e9;
  for (const h of rawHips) { sx0 = Math.min(sx0, h[0]); sx1 = Math.max(sx1, h[0]); sz0 = Math.min(sz0, h[1]); sz1 = Math.max(sz1, h[1]); }
  // loop snap check
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

// ---- hover: sample hero's own IdleHover directly (identity retarget) ----
{
  const g = await loadGLB("src/assets/invincible.glb");
  const scene = g.scene;
  const clip = g.animations[0];
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const F = (n) => { let r = null; scene.traverse((o) => { if (!r && o.name === n) r = o; }); return r; };
  mixer.setTime(0.001); scene.updateMatrixWorld(true);
  const restY = F("Hips_01").position.y;
  const n = Math.round(clip.duration * FPS) + 1;
  const frames = [], hipsTrack = [];
  for (let i = 0; i < n; i++) {
    mixer.setTime(Math.min((clip.duration * i) / (n - 1), clip.duration - 0.0005));
    scene.updateMatrixWorld(true);
    const fq = [];
    for (const hb of ORDER) {
      const q = F(hb).quaternion;
      fq.push(r4(q.x), r4(q.y), r4(q.z), r4(q.w));
    }
    frames.push(fq);
    hipsTrack.push([0, r4(F("Hips_01").position.y - restY), 0]);
  }
  out.clips.hover = { dur: r4(clip.duration), fps: FPS, loop: true, root: "y", stride: 0, snap: 0, frames, hips: hipsTrack };
  console.log(`  hover: ${n} frames, dur=${clip.duration.toFixed(2)}s`);
}

fs.writeFileSync("src/assets/anims.json", JSON.stringify(out));
console.log("wrote src/assets/anims.json", (JSON.stringify(out).length / 1024).toFixed(0) + "KB");
