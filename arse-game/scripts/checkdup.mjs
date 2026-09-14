function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {GLTFLoader}=await import("three/addons/loaders/GLTFLoader.js");
const fs=await import("node:fs");
const buf=fs.readFileSync("src/assets/invincible.glb");
const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
const scene=gltf.scene;
const counts={};const paths={};
scene.traverse(o=>{if(o.isBone||o.type==="Bone"){counts[o.name]=(counts[o.name]||0)+1;let p=[];let x=o;while(x){p.unshift(x.name||x.type);x=x.parent}paths[o.name]=p.join("/")}});
const dups=Object.entries(counts).filter(([k,v])=>v>1);
console.log("total bones:",Object.values(counts).reduce((a,b)=>a+b,0),"unique:",Object.keys(counts).length,"dups:",dups.length);
if(dups.length)console.log(dups.slice(0,10));
console.log("--- skinned meshes ---");
scene.traverse(o=>{if(o.isSkinnedMesh){console.log("mesh:",o.name,"nbones:",o.skeleton.bones.length,"root:",o.skeleton.bones[0].name);
console.log("  first bones:",o.skeleton.bones.slice(0,6).map(b=>b.name).join(","));
let p=[];let x=o;while(x){p.unshift(x.name||x.type);x=x.parent}console.log("  path:",p.join("/"))}});
console.log("--- Hips_01 path ---");console.log(paths["Hips_01"]);
