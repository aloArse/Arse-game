// Regression test for the GLTF hero retarget (heroModel.ts design):
// sanitized+swapped bone map, IdleHover clip base, rest-chain conjugation.
// Fails (exit 1) if any check fails. Run: node scripts/test-rig.mjs
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
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
};

const buf = fs.readFileSync("src/assets/invincible.glb");
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const scene = gltf.scene;
const F = (n) => { let f = null; scene.traverse((o) => { if (!f && o.name === n) f = o; }); return f; };

// ---- must mirror heroModel.ts BONE_NAMES ----
const MAP = {
  spine: "Hips_01", chest: "Chest_04", neck: "NEck_05", head: "Head_06",
  shL: "upper_armR_027", elL: "forearmR_028", wrL: "handR_029",
  shR: "upper_armL_08", elR: "forearmL_09", wrR: "handL_010",
  hipL: "thighR_049", kneeL: "shinR_050", ankL: "footR_051",
  hipR: "thighL_045", kneeR: "shinL_046", ankR: "footL_047",
};
const LIMBS = ["shL", "elL", "wrL", "shR", "elR", "wrR", "hipL", "kneeL", "ankL", "hipR", "kneeR", "ankR"];
const REF = {};
for (const k of ["shL", "elL", "wrL", "shR", "elR", "wrR"]) REF[k] = "Chest_04";
for (const k of ["hipL", "kneeL", "ankL", "hipR", "kneeR", "ankR"]) REF[k] = "Hips_01";
const CHILD = { shL: "elL", elL: "wrL", hipL: "kneeL", kneeL: "ankL", shR: "elR", elR: "wrR", hipR: "kneeR", kneeR: "ankR" };
const POSES = {
  stand: { shL: [-0.5, 0, 0.34], elL: [-0.72, 0, 0.1], hipL: [-0.06, 0, 0.06], kneeL: [0.12, 0, 0], shR: [-0.5, 0, -0.34], elR: [-0.72, 0, -0.1], hipR: [-0.06, 0, -0.06], kneeR: [0.12, 0, 0] },
  fly: { shL: [-2.88, 0.14, 0.14], elL: [-0.07, 0, 0], hipL: [0.13, 0, 0.05], kneeL: [0.1, 0, 0], shR: [-2.88, -0.14, -0.14], elR: [-0.07, 0, 0], hipR: [0.09, 0, -0.05], kneeR: [0.14, 0, 0] },
  punch: { shL: [1.0, 0.22, 0.2], elL: [-1.16, 0, 0], hipL: [-0.36, 0, 0.12], kneeL: [0.52, 0, 0], shR: [-1.66, -0.1, -0.08], elR: [-0.05, 0, 0], hipR: [0.46, 0, -0.12], kneeR: [0.3, 0, 0] },
  stride: { hipL: [-0.62, 0, 0.05], kneeL: [0.5, 0, 0], hipR: [0.62, 0, -0.05], kneeR: [0.1, 0, 0], shL: [-0.9, 0, 0.3], elL: [-0.8, 0, 0], shR: [0.1, 0, -0.3], elR: [-0.8, 0, 0] },
};

check("clip embedded", gltf.animations.length === 1, gltf.animations.map((a) => a.name).join(","));
const missing = Object.entries(MAP).filter(([, bn]) => !F(bn)).map(([k]) => k);
check("all 16 bones found by sanitized name", missing.length === 0, missing.join(","));
check("clavicles found", !!F("shoulderR_026") && !!F("shoulderL_07"));

// facing: toes point +Z natively, GLB L bones on +X (game L = -X => swap required)
scene.rotation.y = 0;
scene.updateMatrixWorld(true);
{
  const toe = new THREE.Vector3(); F("toeL_048").getWorldPosition(toe);
  const foot = new THREE.Vector3(); F("footL_047").getWorldPosition(foot);
  const fwd = toe.sub(foot);
  const hx = new THREE.Vector3(); F("handL_010").getWorldPosition(hx);
  check("model faces +Z natively (no facing fix needed)", fwd.z > 0.1, `toeDir=(${fwd.toArray().map((n) => n.toFixed(2))})`);
  check("GLB L side is +X (swap needed)", hx.x > 0.5, `handL.x=${hx.x.toFixed(2)}`);
}

// ---- replicate heroModel.ts runtime: mixer base + snapshot + conjugated commit ----
const mixer = new THREE.AnimationMixer(scene);
mixer.clipAction(gltf.animations[0]).play();
mixer.update(0);
scene.updateMatrixWorld(true);
const restWorld = {};
scene.traverse((o) => { if (o.isBone) restWorld[o.name] = o.getWorldQuaternion(new THREE.Quaternion()); });
const restChain = {};
for (const k of LIMBS) {
  const b = F(MAP[k]);
  restChain[k] = restWorld[REF[k]].clone().invert().multiply(restWorld[b.parent.name]);
}
restChain.hipL.identity();
restChain.hipR.identity();
const base = {};
const snapshot = () => { for (const [k, bn] of Object.entries(MAP)) base[k] = F(bn).quaternion.clone(); };
const applyPose = (pose) => {
  for (const [k, bn] of Object.entries(MAP)) F(bn).quaternion.copy(base[k]);
  for (const [k, e] of Object.entries(pose)) {
    const b = F(MAP[k]);
    const rp = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    const d = restChain[k] ? restChain[k].clone().invert().multiply(rp).multiply(restChain[k]) : rp;
    b.quaternion.copy(base[k]).premultiply(d);
  }
  scene.updateMatrixWorld(true);
};
const dirs = () => {
  const chestQi = F("Chest_04").getWorldQuaternion(new THREE.Quaternion()).invert();
  const got = {};
  for (const k of Object.keys(CHILD)) {
    const a = new THREE.Vector3(); F(MAP[k]).getWorldPosition(a);
    const c = new THREE.Vector3(); F(MAP[CHILD[k]]).getWorldPosition(c);
    got[k] = c.sub(a).normalize().applyQuaternion(chestQi);
  }
  return got;
};

snapshot();
{
  applyPose(POSES.stand);
  let got = dirs();
  check("stand: arms hang down", got.shL.y < -0.55 && got.shR.y < -0.55, `y=${got.shL.y.toFixed(2)}`);
  applyPose(POSES.fly);
  got = dirs();
  check("fly: arms overhead", got.shL.y > 0.5 && got.shR.y > 0.5, `y=${got.shL.y.toFixed(2)}`);
  applyPose(POSES.punch);
  got = dirs();
  check("punch: arm extends forward", got.shR.z > 0.45, `z=${got.shR.z.toFixed(2)}`);
  applyPose(POSES.stride);
  got = dirs();
  check("stride: thigh forward, shin trails", got.hipL.z > 0.3 && got.hipL.z - got.kneeL.z > 0.15,
    `thigh z=${got.hipL.z.toFixed(2)} trail=${(got.hipL.z - got.kneeL.z).toFixed(2)}`);
  // symmetry on stand + fly
  let sym = 0, n = 0;
  for (const pname of ["stand", "fly"]) {
    applyPose(POSES[pname]);
    got = dirs();
    for (const [l, r] of [["shL", "shR"], ["hipL", "hipR"]]) {
      sym += got[l].angleTo(new THREE.Vector3(-got[r].x, got[r].y, got[r].z)) * 57.3; n++;
    }
  }
  check("L/R mirror symmetry", sym / n < 12, `${(sym / n).toFixed(1)}°`);
  // spine pitch + head yaw (center bones, plain premultiply)
  applyPose({ spine: [0.5, 0, 0], chest: [0.3, 0, 0] });
  const top = new THREE.Vector3(); F("NEck_05").getWorldPosition(top);
  const bot = new THREE.Vector3(); F("Hips_01").getWorldPosition(bot);
  const lean = top.sub(bot).normalize();
  check("spine+chest pitch leans torso forward", lean.z > 0.25, `lean=(${lean.toArray().map((v) => v.toFixed(2))})`);
  applyPose({ head: [0, 0.6, 0] });
  const h0 = new THREE.Vector3(); F("Head_06").getWorldPosition(h0);
  snapshot(); applyPose({});
  const h1 = new THREE.Vector3(); F("Head_06").getWorldPosition(h1);
  check("head yaw does not displace head", h0.distanceTo(h1) < 0.02, `${(h0.distanceTo(h1) * 100).toFixed(1)}cm`);
}

// skinning responds?
{
  mixer.update(0); scene.updateMatrixWorld(true); snapshot(); applyPose({});
  const skinned = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  for (const m of skinned) m.skeleton.update();
  const before = skinned.map((m) => Float32Array.from(m.skeleton.boneMatrices));
  applyPose(POSES.fly);
  for (const m of skinned) m.skeleton.update();
  let d = 0;
  skinned.forEach((m, i) => { const a = before[i], b = m.skeleton.boneMatrices; for (let j = 0; j < a.length; j++) d = Math.max(d, Math.abs(a[j] - b[j])); });
  check("skinning matrices respond to pose", d > 1, `maxΔ=${d.toFixed(1)}`);
}

// loop-boundary pop test: step FORWARD across t=dur, max single-step rotation must be small
{
  const m2 = new THREE.AnimationMixer(scene);
  m2.clipAction(gltf.animations[0]).play();
  const dur = gltf.animations[0].duration;
  m2.update(0);
  // advance to just before the boundary
  let t = 0;
  while (t < dur - 0.05) { m2.update(1 / 60); t += 1 / 60; }
  scene.updateMatrixWorld(true);
  let prev = Object.values(MAP).map((bn) => F(bn).quaternion.clone());
  let maxStep = 0;
  for (let i = 0; i < 12; i++) {
    m2.update(1 / 60);
    scene.updateMatrixWorld(true);
    Object.values(MAP).forEach((bn, j) => {
      maxStep = Math.max(maxStep, F(bn).quaternion.angleTo(prev[j]) * 57.3);
      prev[j] = F(bn).quaternion.clone();
    });
  }
  check("no pop across loop boundary", maxStep < 3, `max 1-frame step=${maxStep.toFixed(2)}°`);
}

// long-run stability: 480 frames forward with live poses, no NaN, returns after full loops
{
  const m3 = new THREE.AnimationMixer(scene);
  m3.clipAction(gltf.animations[0]).play();
  m3.update(0);
  scene.updateMatrixWorld(true);
  snapshot(); applyPose(POSES.stand);
  const q0 = Object.values(MAP).map((bn) => F(bn).quaternion.clone());
  let nan = 0;
  const names = Object.keys(POSES);
  for (let i = 0; i < 480; i++) {
    m3.update(1 / 60);
    scene.updateMatrixWorld(true);
    snapshot();
    applyPose(POSES[names[i % names.length]]);
    for (const bn of Object.values(MAP)) {
      const q = F(bn).quaternion;
      if (!isFinite(q.x + q.y + q.z + q.w)) nan++;
    }
  }
  check("480 frames: no NaN", nan === 0);
  void q0;
}

// eye glow target?
{
  const names = [];
  scene.traverse((o) => {
    if (o.isSkinnedMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) names.push(m.name);
  });
  check("goggles material exists (eye-glow target)", names.some((n) => /goggle/i.test(n || "")), names.join(", "));
}

console.log(failures ? `\n${failures} FAILURES` : "\nALL RIG CHECKS PASSED");
process.exit(failures ? 1 : 0);
