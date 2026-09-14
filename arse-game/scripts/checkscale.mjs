function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {GLTFLoader}=await import("three/addons/loaders/GLTFLoader.js");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
const buf=fs.readFileSync("src/assets/invincible.glb");
const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
console.log("=== HERO GLB non-unit scales ===");
gltf.scene.traverse(o=>{const s=o.scale;if(Math.abs(s.x-1)>1e-4||Math.abs(s.y-1)>1e-4||Math.abs(s.z-1)>1e-4)console.log(o.type,o.name,`scale=(${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)})`)});
const fbx=fs.readFileSync("/home/user/animsrc/Liam@punching.fbx");
const fscene=await new FBXLoader().parse(fbx.buffer.slice(fbx.byteOffset,fbx.byteOffset+fbx.byteLength),"");
console.log("=== LIAM FBX non-unit scales ===");
let n=0;fscene.traverse(o=>{const s=o.scale;if(Math.abs(s.x-1)>1e-4||Math.abs(s.y-1)>1e-4||Math.abs(s.z-1)>1e-4){if(n++<25)console.log(o.type,o.name,`scale=(${s.x.toFixed(4)},${s.y.toFixed(4)},${s.z.toFixed(4)})`)}});
console.log(`(total non-unit: ${n})`);
