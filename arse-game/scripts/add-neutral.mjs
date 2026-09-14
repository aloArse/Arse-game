// Appends a static 'neutral' clip (bind-pose local quats) to anims.json.
// Procedural ability poses ride this drift-free base instead of the animated hover.
// Guard: no-op if 'neutral' already exists. Run: node scripts/add-neutral.mjs
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
const A = JSON.parse(fs.readFileSync("src/assets/anims.json", "utf8"));
if (A.clips.neutral) { console.log("neutral already present — nothing to do."); process.exit(0); }
const buf = fs.readFileSync("src/assets/invincible.glb");
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const scene = gltf.scene;
scene.updateMatrixWorld(true);
const F = (n) => { let r = null; scene.traverse((o) => { if (!r && o.name === n) r = o; }); return r; };
const r4 = (n) => Math.round(n * 10000) / 10000;
const fr = [];
for (const bn of A.bones) {
  const q = F(bn).quaternion;
  if (Math.abs(q.length() - 1) > 0.01) { console.error(`bind quat non-unit: ${bn}`); process.exit(1); }
  fr.push(r4(q.x), r4(q.y), r4(q.z), r4(q.w));
}
A.clips.neutral = { dur: 1.0, fps: 30, loop: true, root: "none", stride: 0, snap: 0, frames: [fr, fr.slice()], hips: [[0, 0, 0], [0, 0, 0]] };
fs.writeFileSync("src/assets/anims.json", JSON.stringify(A));
console.log("appended neutral clip. clips:", Object.keys(A.clips).length);
