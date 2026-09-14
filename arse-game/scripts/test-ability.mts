// Verifies ability/flight procedural poses ON the hero skeleton, with engine pitch.
// Replicates heroModel commit EXACTLY: neutral static base + conjugated Euler offsets.
// Imports REAL POSES from character.ts (bundle+run with esbuild — see package run line).
// Run: npx esbuild scripts/test-ability.mts --bundle --platform=node --format=esm --external:three* --outfile=scripts/tmp-ability.mjs && node scripts/tmp-ability.mjs
function makeImg(): unknown {
  const listeners: Record<string, Array<() => void>> = {};
  const img: Record<string, unknown> = { width: 4, height: 4, complete: false, _src: "", style: {},
    addEventListener(t: string, fn: () => void) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener(t: string, fn: () => void) { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); } };
  Object.defineProperty(img, "src", { set(v: string) { img._src = v; setTimeout(() => { img.complete = true; for (const fn of listeners.load || []) fn.call(img); }, 0); }, get() { return img._src; } });
  return img;
}
(globalThis as Record<string, unknown>).document = { createElementNS: () => makeImg() };
(globalThis as Record<string, unknown>).self = globalThis;
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as fs from "node:fs";
import { POSES, type Pose, type JointName } from "../src/game3d/character";

let failures = 0;
const check = (n: string, ok: boolean, x = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? " — " + x : ""}`); if (!ok) failures++; };

const buf = fs.readFileSync("src/assets/invincible.glb");
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const scene = gltf.scene;
const A = JSON.parse(fs.readFileSync("src/assets/anims.json", "utf8"));
const bones: string[] = A.bones;
// body wrapper with engine pitch (mirrors rig.body containing the model)
const body = new THREE.Group();
body.add(scene);
const F = (n: string): THREE.Object3D => { let r: THREE.Object3D | null = null; scene.traverse((o) => { if (!r && o.name === n) r = o; }); return r!; };

const MAP: Record<string, string> = {
  spine: "Hips_01", chest: "Chest_04", neck: "NEck_05", head: "Head_06",
  shL: "upper_armR_027", elL: "forearmR_028", wrL: "handR_029",
  shR: "upper_armL_08", elR: "forearmL_09", wrR: "handL_010",
  hipL: "thighR_049", kneeL: "shinR_050", ankL: "footR_051",
  hipR: "thighL_045", kneeR: "shinL_046", ankR: "footL_047",
};
const REF: Record<string, string> = {};
for (const k of ["shL", "elL", "wrL", "shR", "elR", "wrR"]) REF[k] = "Chest_04";
for (const k of ["hipL", "kneeL", "ankL", "hipR", "kneeR", "ankR"]) REF[k] = "Hips_01";
const restHips = F("Hips_01").position.clone();
// bind reference chains (== heroModel.computeRestChains)
body.rotation.x = 0; body.updateMatrixWorld(true);
const RC: Record<string, THREE.Quaternion> = {}, RCI: Record<string, THREE.Quaternion> = {};
{
  const refQ = new THREE.Quaternion(), parQ = new THREE.Quaternion();
  for (const k of Object.keys(REF)) {
    const b = F(MAP[k]);
    b.parent!.getWorldQuaternion(parQ);
    F(REF[k]).getWorldQuaternion(refQ);
    RC[k] = refQ.clone().invert().multiply(parQ);
    RCI[k] = RC[k].clone().invert();
  }
}
// Head bone local axis check (for faceDir validity)
{
  const q = F("Head_06").getWorldQuaternion(new THREE.Quaternion());
  const z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  console.log(`INFO  head-bind +Z in world: (${z.x.toFixed(2)},${z.y.toFixed(2)},${z.z.toFixed(2)}) ${z.z > 0.9 ? "=> faceDir valid" : "=> FACE AXIS UNKNOWN"}`);
}
// neutral static base (== heroModel procedural base)
function basePose(): { q: THREE.Quaternion[]; h: THREE.Vector3 } {
  const c = A.clips.neutral;
  const F0 = c.frames[0];
  const q = bones.map((_, bi) => new THREE.Quaternion(F0[bi * 4], F0[bi * 4 + 1], F0[bi * 4 + 2], F0[bi * 4 + 3]));
  return { q, h: new THREE.Vector3(0, 0, 0) };
}
const BASE = basePose();
// apply pose fully converged (== engine blend k->1) then pitch
function applyPose(name: string, pitch: number): void {
  const pose = POSES[name] as Pose;
  bones.forEach((bn, bi) => { F(bn).quaternion.copy(BASE.q[bi]); });
  F("Hips_01").position.copy(restHips).add(BASE.h);
  const tmp = new THREE.Quaternion(), tmp2 = new THREE.Quaternion(), e = new THREE.Euler();
  for (const key of Object.keys(MAP)) {
    const t = pose[key as JointName];
    tmp.setFromEuler(e.set(t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0));
    if (RC[key]) { tmp2.copy(RCI[key]).multiply(tmp).multiply(RC[key]); F(MAP[key]).quaternion.premultiply(tmp2); }
    else F(MAP[key]).quaternion.premultiply(tmp);
  }
  // clavicle follow (== heroModel)
  const shL = pose.shL || [0, 0, 0], shR = pose.shR || [0, 0, 0];
  tmp.setFromEuler(e.set(shL[0] * 0.3, shL[1] * 0.3, 0));
  F("shoulderR_026").quaternion.premultiply(tmp);
  tmp.setFromEuler(e.set(shR[0] * 0.3, shR[1] * 0.3, 0));
  F("shoulderL_07").quaternion.premultiply(tmp);
  body.rotation.x = pitch;
  body.updateMatrixWorld(true);
}
// body-frame position (unpitched): spatial reads independent of engine pitch
const bq = new THREE.Quaternion();
function BP(n: string): THREE.Vector3 {
  const v = new THREE.Vector3();
  F(n).getWorldPosition(v);
  body.getWorldQuaternion(bq).invert();
  return v.applyQuaternion(bq);
}
const segAngle = (a: string, b: string, c: string, d: string): number => {
  const u = BP(b).sub(BP(a)).normalize(), v = BP(d).sub(BP(c)).normalize();
  return Math.acos(Math.min(1, Math.max(-1, u.dot(v))));
};
function faceBody(): THREE.Vector3 {
  // head facing in BODY frame (axis-verified at bind above)
  const qh = F("Head_06").getWorldQuaternion(new THREE.Quaternion());
  const qb = body.getWorldQuaternion(new THREE.Quaternion()).invert();
  return new THREE.Vector3(0, 0, 1).applyQuaternion(qh).applyQuaternion(qb);
}

// world-frame position (engine pitch applied): for fly/fist/dash the body is
// horizontal, so "forward" only exists in world space (body-up => world-forward)
function WP(n: string): THREE.Vector3 {
  const v = new THREE.Vector3();
  F(n).getWorldPosition(v);
  return v;
}
// ---- fly (superman cruise, pitch 1.28) ----
{
  applyPose("fly", 1.28);
  const hL = WP("handR_029"), hR = WP("handL_010"), head = WP("Head_06");
  const elL = segAngle("upper_armR_027", "forearmR_028", "forearmR_028", "handR_029");
  const elR = segAngle("upper_armL_08", "forearmL_09", "forearmL_09", "handL_010");
  const knL = segAngle("thighR_049", "shinR_050", "shinR_050", "footR_051");
  const knR = segAngle("thighL_045", "shinL_046", "shinL_046", "footL_047");
  const toeL = BP("toeR_052"), ankL = BP("footR_051");
  const fd = faceBody();
  check("fly: hands reach past head (world)", hL.z - head.z > 0.0 && hR.z - head.z > 0.0, `L+${(hL.z - head.z).toFixed(2)} R+${(hR.z - head.z).toFixed(2)}`);
  check("fly: hands level with head", Math.abs(hL.y - head.y) < 0.5 && Math.abs(hR.y - head.y) < 0.5, `${Math.abs(hL.y - head.y).toFixed(2)}/${Math.abs(hR.y - head.y).toFixed(2)}`);
  check("fly: hands symmetric", Math.abs(Math.abs(hL.x) - Math.abs(hR.x)) < 0.25, `d=${Math.abs(Math.abs(hL.x) - Math.abs(hR.x)).toFixed(2)}`);
  check("fly: arms straight", elL < 0.3 && elR < 0.3, `${elL.toFixed(2)}/${elR.toFixed(2)}rad`);
  check("fly: legs straight", knL < 0.3 && knR < 0.3, `${knL.toFixed(2)}/${knR.toFixed(2)}rad`);
  check("fly: toes pointed", toeL.y - ankL.y < -0.08, `dy=${(toeL.y - ankL.y).toFixed(2)}`);
  check("fly: face forward-up", fd.z > 0.7 && fd.y > -0.15 && fd.y < 0.6, `(${fd.x.toFixed(2)},${fd.y.toFixed(2)},${fd.z.toFixed(2)})`);
}
// ---- fist (cruise punch-fly, pitch 1.28) ----
{
  applyPose("fist", 1.28);
  const punch = WP("handL_010"), head = WP("Head_06"); // game-R (file-L)
  const back = WP("handR_029"), bs = WP("upper_armR_027");
  const knL = segAngle("thighR_049", "shinR_050", "shinR_050", "footR_051");
  const knR = segAngle("thighL_045", "shinL_046", "shinL_046", "footL_047");
  const fd = faceBody();
  check("fist: game-R fist leads past head (world)", punch.z - head.z > 0.15, `+${(punch.z - head.z).toFixed(2)}`);
  check("fist: game-L hand trails (world)", back.z - bs.z < -0.05, `${(back.z - bs.z).toFixed(2)}`);
  check("fist: legs trail fairly straight", knL < 0.4 && knR < 0.4, `${knL.toFixed(2)}/${knR.toFixed(2)}`);
  check("fist: symmetric-ish legs", Math.abs(knL - knR) < 0.2, `d=${Math.abs(knL - knR).toFixed(2)}`);
  check("fist: face forward", fd.z > 0.7, `(${fd.x.toFixed(2)},${fd.y.toFixed(2)},${fd.z.toFixed(2)})`);
}
// ---- dash (missile, pitch 1.28) ----
{
  applyPose("dash", 1.28);
  const hL = WP("handR_029"), hR = WP("handL_010"), hips = WP("Hips_01");
  const elL = segAngle("upper_armR_027", "forearmR_028", "forearmR_028", "handR_029");
  const elR = segAngle("upper_armL_08", "forearmL_09", "forearmL_09", "handL_010");
  const knL = segAngle("thighR_049", "shinR_050", "shinR_050", "footR_051");
  const knR = segAngle("thighL_045", "shinL_046", "shinL_046", "footL_047");
  const fSpread = Math.abs(BP("footR_051").x - BP("footL_047").x);
  const fd = faceBody();
  check("dash: hands at hip line or behind (world)", hL.z - hips.z < 0.05 && hR.z - hips.z < 0.05, `L${(hL.z - hips.z).toFixed(2)} R${(hR.z - hips.z).toFixed(2)}`);
  check("dash: arms straight back", elL < 0.35 && elR < 0.35, `${elL.toFixed(2)}/${elR.toFixed(2)}`);
  check("dash: hands tucked to body", Math.abs(hL.x) < 0.55 && Math.abs(hR.x) < 0.55, `${Math.abs(hL.x).toFixed(2)}/${Math.abs(hR.x).toFixed(2)}`);
  check("dash: legs straight together", knL < 0.3 && knR < 0.3 && fSpread < 0.45, `kn=${knL.toFixed(2)}/${knR.toFixed(2)} spread=${fSpread.toFixed(2)}`);
  check("dash: face forward-up", fd.z > 0.7 && fd.y > -0.15, `(${fd.x.toFixed(2)},${fd.y.toFixed(2)},${fd.z.toFixed(2)})`);
}
// ---- spin (cyclone T, pitch 0.1) ----
{
  applyPose("spin", 0.1);
  const hL = BP("handR_029"), hR = BP("handL_010");
  const sL = BP("upper_armR_027"), sR = BP("upper_armL_08");
  const knL = segAngle("thighR_049", "shinR_050", "shinR_050", "footR_051");
  const knR = segAngle("thighL_045", "shinL_046", "shinL_046", "footL_047");
  const fd = faceBody();
  check("spin: arms out to sides", Math.abs(hL.x) > 0.55 && Math.abs(hR.x) > 0.55, `${Math.abs(hL.x).toFixed(2)}/${Math.abs(hR.x).toFixed(2)}`);
  check("spin: hands near shoulder height", Math.abs(hL.y - sL.y) < 0.45 && Math.abs(hR.y - sR.y) < 0.45, `${Math.abs(hL.y - sL.y).toFixed(2)}/${Math.abs(hR.y - sR.y).toFixed(2)}`);
  check("spin: symmetric", Math.abs(Math.abs(hL.x) - Math.abs(hR.x)) < 0.25, `d=${Math.abs(Math.abs(hL.x) - Math.abs(hR.x)).toFixed(2)}`);
  check("spin: knees soft not deep", knL < 0.75 && knR < 0.75, `${knL.toFixed(2)}/${knR.toFixed(2)}`);
  check("spin: face forward", fd.z > 0.85 && Math.abs(fd.y) < 0.3, `(${fd.x.toFixed(2)},${fd.y.toFixed(2)},${fd.z.toFixed(2)})`);
}
// ---- slamUp (takeoff, pitch -0.35) ----
{
  applyPose("slamUp", -0.35);
  const hL = BP("handR_029"), hR = BP("handL_010"), head = BP("Head_06");
  const elL = segAngle("upper_armR_027", "forearmR_028", "forearmR_028", "handR_029");
  const elR = segAngle("upper_armL_08", "forearmL_09", "forearmL_09", "handL_010");
  const fSpread = Math.abs(BP("footR_051").x - BP("footL_047").x);
  const fd = faceBody();
  check("slamUp: hands overhead", hL.y > head.y + 0.05 && hR.y > head.y + 0.05, `${(hL.y - head.y).toFixed(2)}/${(hR.y - head.y).toFixed(2)}`);
  check("slamUp: arms fairly straight", elL < 0.55 && elR < 0.55, `${elL.toFixed(2)}/${elR.toFixed(2)}`);
  check("slamUp: legs together", fSpread < 0.5, `spread=${fSpread.toFixed(2)}`);
  check("slamUp: face up-forward", fd.y > -0.2 && fd.y < 0.65 && fd.z > 0.6, `(${fd.x.toFixed(2)},${fd.y.toFixed(2)},${fd.z.toFixed(2)})`);
}
// ---- slamDown (meteor drop, pitch 0.2) ----
{
  applyPose("slamDown", 0.2);
  const hL = BP("handR_029"), hR = BP("handL_010");
  const sL = BP("upper_armR_027"), sR = BP("upper_armL_08");
  const knL = segAngle("thighR_049", "shinR_050", "shinR_050", "footR_051");
  const knR = segAngle("thighL_045", "shinL_046", "shinL_046", "footL_047");
  const fSpread = Math.abs(BP("footR_051").x - BP("footL_047").x);
  const torsoUp = BP("Chest_04").sub(BP("Hips_01")).normalize();
  const upTilt = Math.acos(Math.min(1, Math.max(-1, torsoUp.y)));
  const thL = BP("shinR_050").sub(BP("thighR_049")).normalize();
  const tuck = Math.acos(Math.min(1, Math.max(-1, thL.dot(torsoUp.clone().negate()))));
  const fd = faceBody();
  check("slamDown: legs together", fSpread < 0.4, `spread=${fSpread.toFixed(2)}`);
  check("slamDown: knees nearly straight", knL < 0.5 && knR < 0.5, `${knL.toFixed(2)}/${knR.toFixed(2)}`);
  check("slamDown: no cannonball tuck", tuck < 0.85, `tuck=${tuck.toFixed(2)}rad`);
  check("slamDown: torso upright-ish", upTilt < 0.7, `tilt=${upTilt.toFixed(2)}rad`);
  check("slamDown: arms down-out", hL.y < sL.y - 0.1 && hR.y < sR.y - 0.1 && Math.abs(hL.x) > 0.2 && Math.abs(hL.x) < 0.85, `dy=${(hL.y - sL.y).toFixed(2)} x=${Math.abs(hL.x).toFixed(2)}`);
  check("slamDown: face forward-down", fd.z > 0.7 && fd.y < 0.15 && fd.y > -0.65, `(${fd.x.toFixed(2)},${fd.y.toFixed(2)},${fd.z.toFixed(2)})`);
}
// ---- grab (hold victim, pitch 0.3) ----
{
  applyPose("grab", 0.3);
  const hL = BP("handR_029"), hR = BP("handL_010");
  const hips = BP("Hips_01"), chest = BP("Chest_04");
  const knL = segAngle("thighR_049", "shinR_050", "shinR_050", "footR_051");
  const knR = segAngle("thighL_045", "shinL_046", "shinL_046", "footL_047");
  check("grab: hands forward", hL.z - hips.z > 0.35 && hR.z - hips.z > 0.35, `+${(hL.z - hips.z).toFixed(2)}/+${(hR.z - hips.z).toFixed(2)}`);
  check("grab: hands at chest height", Math.abs(hL.y - chest.y) < 0.4 && Math.abs(hR.y - chest.y) < 0.4, `${Math.abs(hL.y - chest.y).toFixed(2)}/${Math.abs(hR.y - chest.y).toFixed(2)}`);
  check("grab: symmetric reach", Math.abs((hL.z - hips.z) - (hR.z - hips.z)) < 0.2, `d=${Math.abs(hL.z - hR.z).toFixed(2)}`);
  check("grab: knees soft", knL > 0.1 && knL < 0.95 && knR > 0.1 && knR < 0.95, `${knL.toFixed(2)}/${knR.toFixed(2)}`);
}
console.log(failures ? `\n${failures} FAILURES` : "\nALL ABILITY CHECKS PASSED");
process.exit(failures ? 1 : 0);
