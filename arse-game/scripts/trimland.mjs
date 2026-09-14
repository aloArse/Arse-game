// Sub-trim land to start at deepest crouch (slam impact frame). One-shot.
// Guard: only runs when land.dur == 1.2 (untrimmed). Run: node scripts/trimland.mjs
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
const c = A.clips.land;
if (Math.abs(c.dur - 1.2) > 0.001) { console.error(`REFUSING: land.dur=${c.dur}, expected 1.2`); process.exit(1); }
const bones = A.bones;
const P = (n) => { const v = new THREE.Vector3(); F(n).getWorldPosition(v); return v; };
// thigh forward pitch over the clip (deepest crouch = max)
let bi = 0, bv = -1e9;
const N = 48;
for (let i = 0; i <= N; i++) {
  const f = (i / N) * (c.frames.length - 1);
  const i0 = Math.floor(f), u = f - i0, i1 = Math.min(c.frames.length - 1, i0 + 1);
  const F0 = c.frames[i0], F1 = c.frames[i1];
  bones.forEach((bn, bbi) => {
    F(bn).quaternion.set(
      F0[bbi * 4] + (F1[bbi * 4] - F0[bbi * 4]) * u, F0[bbi * 4 + 1] + (F1[bbi * 4 + 1] - F0[bbi * 4 + 1]) * u,
      F0[bbi * 4 + 2] + (F1[bbi * 4 + 2] - F0[bbi * 4 + 2]) * u, F0[bbi * 4 + 3] + (F1[bbi * 4 + 3] - F0[bbi * 4 + 3]) * u).normalize();
  });
  scene.updateMatrixWorld(true);
  const hq = F("Hips_01").getWorldQuaternion(new THREE.Quaternion()).invert();
  const th = P("shinL_046").sub(P("thighL_045")).normalize().applyQuaternion(hq);
  const pitch = Math.atan2(th.z, -th.y); // forward+
  if (pitch > bv) { bv = pitch; bi = i; }
}
const tDeep = (bi / N) * c.dur;
console.log(`deepest crouch @${tDeep.toFixed(2)}s (pitch=${bv.toFixed(2)}rad)`);
const n = c.frames.length;
const i0 = Math.round((tDeep / c.dur) * (n - 1));
A.clips.land = { ...c, dur: Math.round((((n - 1 - i0) / 30)) * 10000) / 10000,
  frames: c.frames.slice(i0), hips: c.hips.slice(i0) };
console.log(`land: [${tDeep.toFixed(2)},${c.dur}] -> dur=${A.clips.land.dur}s (${A.clips.land.frames.length}f)`);
fs.writeFileSync("src/assets/anims.json", JSON.stringify(A));
console.log("wrote src/assets/anims.json");
