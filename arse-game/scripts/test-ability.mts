// Verifies ability/flight BAKED mocap (flyM/swimM/spinM/grabM) on the hero skeleton
// with real engine pitches. Replicates heroModel.sampleInto + body pitch exactly.
// Run: npx esbuild scripts/test-ability.mts --bundle --platform=node --format=esm --external:three* --outfile=scripts/tmp-ability.mjs --log-level=error && node scripts/tmp-ability.mjs
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
import { POSES } from "../src/game3d/character";

let failures = 0;
const check = (n: string, ok: boolean, x = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? " — " + x : ""}`); if (!ok) failures++; };

const buf = fs.readFileSync("src/assets/invincible.glb");
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const scene = gltf.scene;
const A = JSON.parse(fs.readFileSync("src/assets/anims.json", "utf8"));
const bones: string[] = A.bones;
const body = new THREE.Group();
body.add(scene);
const F = (n: string): THREE.Object3D => { let r: THREE.Object3D | null = null; scene.traverse((o) => { if (!r && o.name === n) r = o; }); return r!; };
const restHips = F("Hips_01").position.clone();

// heroModel.sampleInto mirror: nlerp baked frames, apply quats + hips, set pitch
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
function sampleClip(clip: string, t: number, pitch: number): void {
  const c = A.clips[clip];
  const tt = ((t % c.dur) + c.dur) % c.dur;
  const f = (tt / c.dur) * (c.frames.length - 1);
  const i0 = Math.floor(f), i1 = Math.min(c.frames.length - 1, i0 + 1), u = f - i0;
  const F0 = c.frames[i0], F1 = c.frames[i1];
  bones.forEach((bn, bi) => {
    _qa.set(F0[bi * 4], F0[bi * 4 + 1], F0[bi * 4 + 2], F0[bi * 4 + 3]);
    _qb.set(F1[bi * 4], F1[bi * 4 + 1], F1[bi * 4 + 2], F1[bi * 4 + 3]);
    if (_qa.dot(_qb) < 0) { _qb.x *= -1; _qb.y *= -1; _qb.z *= -1; _qb.w *= -1; }
    F(bn).quaternion.set(
      _qa.x + (_qb.x - _qa.x) * u, _qa.y + (_qb.y - _qa.y) * u,
      _qa.z + (_qb.z - _qa.z) * u, _qa.w + (_qb.w - _qa.w) * u).normalize();
  });
  const H0 = c.hips[i0], H1 = c.hips[i1];
  F("Hips_01").position.set(
    restHips.x + H0[0] + (H1[0] - H0[0]) * u,
    restHips.y + H0[1] + (H1[1] - H0[1]) * u,
    restHips.z + H0[2] + (H1[2] - H0[2]) * u);
  // flight gaze offset (== heroModel commit, converged w=1)
  if (clip === "flyM" || clip === "swimM") {
    const T = clip === "flyM" ? -0.72 : -0.95;
    _qa.setFromEuler(new THREE.Euler(T * 0.4, 0, 0));
    F("NEck_05").quaternion.premultiply(_qa);
    _qa.setFromEuler(new THREE.Euler(T * 0.6, 0, 0));
    F("Head_06").quaternion.premultiply(_qa);
  }
  body.rotation.x = pitch;
  body.updateMatrixWorld(true);
}
const bq = new THREE.Quaternion();
function BP(n: string): THREE.Vector3 {
  const v = new THREE.Vector3();
  F(n).getWorldPosition(v);
  body.getWorldQuaternion(bq).invert();
  return v.applyQuaternion(bq);
}
function WP(n: string): THREE.Vector3 {
  const v = new THREE.Vector3();
  F(n).getWorldPosition(v);
  return v;
}
const segAngle = (a: string, b: string, c: string, d: string): number => {
  const u = BP(b).sub(BP(a)).normalize(), v = BP(d).sub(BP(c)).normalize();
  return Math.acos(Math.min(1, Math.max(-1, u.dot(v))));
};
function faceBody(): THREE.Vector3 {
  const qh = F("Head_06").getWorldQuaternion(new THREE.Quaternion());
  const qb = body.getWorldQuaternion(new THREE.Quaternion()).invert();
  return new THREE.Vector3(0, 0, 1).applyQuaternion(qh).applyQuaternion(qb);
}
function hipsUpBody(): THREE.Vector3 {
  const qh = F("Hips_01").getWorldQuaternion(new THREE.Quaternion());
  const qb = body.getWorldQuaternion(new THREE.Quaternion()).invert();
  return new THREE.Vector3(0, 1, 0).applyQuaternion(qh).applyQuaternion(qb);
}

// enemy-rig poses must stay defined (enemies still ride procedural POSES values)
{
  const names = ["fly", "fist", "dash", "spin", "slamUp", "slamDown", "grab"];
  const ok = names.every((n) => (POSES as Record<string, unknown>)[n] !== undefined
    && Array.isArray((POSES as Record<string, Record<string, unknown>>)[n].shL));
  check("enemy POSES identities+values intact", ok, names.join(","));
}
// ---- menu/cruise-fast: swimM breaststroke, pitch 0.05 ----
{
  sampleClip("swimM", 0, 0.05);
  const h0L = WP("handR_029"), h0R = WP("handL_010"), f0L = WP("footR_051");
  sampleClip("swimM", 1.1, 0.05);
  const h1L = WP("handR_029"), h1R = WP("handL_010"), f1L = WP("footR_051");
  const head = WP("Head_06"), hips = WP("Hips_01");
  const up = hipsUpBody();
  const fd = faceBody();
  check("menu: body horizontal face-down", up.z > 0.85, `upZ=${up.z.toFixed(2)}`);
  check("menu: head leads forward (world)", head.z - hips.z > 0.5, `+${(head.z - hips.z).toFixed(2)}`);
  check("menu: stroke alive (hands move)", h0L.distanceTo(h1L) > 0.25 && h0R.distanceTo(h1R) > 0.25,
    `${h0L.distanceTo(h1L).toFixed(2)}/${h0R.distanceTo(h1R).toFixed(2)}m`);
  check("menu: kick alive (feet move)", f0L.distanceTo(f1L) > 0.15, `${f0L.distanceTo(f1L).toFixed(2)}m`);
  check("menu: gaze forward", fd.z > 0.85 && Math.abs(fd.y) < 0.4, `(${fd.x.toFixed(2)},${fd.y.toFixed(2)},${fd.z.toFixed(2)})`);
}
// ---- cruise fly: flyM superman, pitch 0 ----
{
  sampleClip("flyM", 0.7, 0);
  const hL = WP("handR_029"), hR = WP("handL_010");
  const fL = WP("footR_051"), fR = WP("footL_047");
  const head = WP("Head_06"), hips = WP("Hips_01");
  const up = hipsUpBody();
  const fd = faceBody();
  check("fly: body horizontal face-down", up.z > 0.85, `upZ=${up.z.toFixed(2)}`);
  check("fly: arms spread wide", Math.abs(hL.x) > 0.5 && Math.abs(hR.x) > 0.5, `${Math.abs(hL.x).toFixed(2)}/${Math.abs(hR.x).toFixed(2)}`);
  check("fly: head leads forward", head.z - hips.z > 0.5, `+${(head.z - hips.z).toFixed(2)}`);
  check("fly: legs trail behind", hips.z - fL.z > 0.5 && hips.z - fR.z > 0.5, `${(hips.z - fL.z).toFixed(2)}/${(hips.z - fR.z).toFixed(2)}`);
  check("fly: gaze forward", fd.z > 0.85 && Math.abs(fd.y) < 0.4, `(${fd.x.toFixed(2)},${fd.y.toFixed(2)},${fd.z.toFixed(2)})`);
}
// ---- dash: swimM burst, pitch 0 ----
{
  sampleClip("swimM", 2.2, 0);
  const h0 = WP("handR_029").clone();
  sampleClip("swimM", 3.3, 0);
  const moved = WP("handR_029").distanceTo(h0);
  const head = WP("Head_06"), hips = WP("Hips_01");
  const up = hipsUpBody();
  check("dash: body horizontal face-down", up.z > 0.85, `upZ=${up.z.toFixed(2)}`);
  check("dash: stroke alive", moved > 0.25, `${moved.toFixed(2)}m`);
  check("dash: head leads forward", head.z - hips.z > 0.5, `+${(head.z - hips.z).toFixed(2)}`);
}
// ---- spin: spinM cyclone, pitch 0.1 ----
{
  const N = 8;
  let travel = 0, prev: number | null = null, minUpY = 1;
  for (let i = 0; i <= N; i++) {
    sampleClip("spinM", (A.clips.spinM.dur * i) / N, 0.1);
    const qh = F("Hips_01").getWorldQuaternion(new THREE.Quaternion());
    const qb = body.getWorldQuaternion(new THREE.Quaternion()).invert();
    const qbq = qb.clone().multiply(qh);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(qbq);
    minUpY = Math.min(minUpY, up.y);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qbq);
    const yaw = Math.atan2(fwd.x, fwd.z);
    if (prev !== null) {
      let d = yaw - prev;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      travel += d;
    }
    prev = yaw;
  }
  check("spin: full 360° whirl", Math.abs(Math.abs(travel) - Math.PI * 2) < Math.PI * 2 * 0.25, `travel=${(travel * 57.3).toFixed(0)}°`);
  check("spin: stays upright", minUpY > 0.9, `minUpY=${minUpY.toFixed(2)}`);
}
// ---- rise: flyM + nose-up pitch -0.35 ----
{
  sampleClip("flyM", 1.3, -0.35);
  const hL = WP("handR_029"), hR = WP("handL_010");
  const head = WP("Head_06"), hips = WP("Hips_01");
  const fd = faceBody();
  check("rise: head above hips (world)", head.y - hips.y > 0.25, `+${(head.y - hips.y).toFixed(2)}`);
  check("rise: still advances forward", head.z - hips.z > 0.3, `+${(head.z - hips.z).toFixed(2)}`);
  check("rise: arms spread", Math.abs(hL.x) > 0.5 && Math.abs(hR.x) > 0.5, `${Math.abs(hL.x).toFixed(2)}/${Math.abs(hR.x).toFixed(2)}`);
  check("rise: gaze forward", fd.z > 0.85 && Math.abs(fd.y) < 0.4, `(${fd.x.toFixed(2)},${fd.y.toFixed(2)},${fd.z.toFixed(2)})`);
}
// ---- dive: flyM + steep pitch 0.75 ----
{
  sampleClip("flyM", 2.0, 0.75);
  const head = WP("Head_06"), hips = WP("Hips_01"), feet = WP("footR_051");
  const fd = faceBody();
  check("dive: head below hips (world)", hips.y - head.y > 0.4, `-${(hips.y - head.y).toFixed(2)}`);
  check("dive: feet above hips", feet.y - hips.y > 0.2, `+${(feet.y - hips.y).toFixed(2)}`);
  check("dive: still advances forward", head.z - hips.z > 0.2, `+${(head.z - hips.z).toFixed(2)}`);
  check("dive: gaze forward", fd.z > 0.85 && Math.abs(fd.y) < 0.4, `(${fd.x.toFixed(2)},${fd.y.toFixed(2)},${fd.z.toFixed(2)})`);
}
// ---- grab: grabM carry hold, pitch 0.06 ----
{
  sampleClip("grabM", 0.5, 0.06);
  const hL = BP("handR_029"), hR = BP("handL_010");
  const hips = BP("Hips_01"), chest = BP("Chest_04");
  const up = hipsUpBody();
  const knL = segAngle("thighR_049", "shinR_050", "shinR_050", "footR_051");
  const knR = segAngle("thighL_045", "shinL_046", "shinL_046", "footL_047");
  check("grab: upright", up.y > 0.95, `upY=${up.y.toFixed(2)}`);
  check("grab: hands cradle forward", hL.z - hips.z > 0.15 && hR.z - hips.z > 0.15,
    `+${(hL.z - hips.z).toFixed(2)}/+${(hR.z - hips.z).toFixed(2)}`);
  check("grab: hands at chest height", Math.abs(hL.y - chest.y) < 0.45 && Math.abs(hR.y - chest.y) < 0.45,
    `${Math.abs(hL.y - chest.y).toFixed(2)}/${Math.abs(hR.y - chest.y).toFixed(2)}`);
  check("grab: braced carry crouch", knL > 0.3 && knL < 1.0 && knR > 0.3 && knR < 1.0, `${knL.toFixed(2)}/${knR.toFixed(2)}`);
}
console.log(failures ? `\n${failures} FAILURES` : "\nALL ABILITY CHECKS PASSED");
process.exit(failures ? 1 : 0);
