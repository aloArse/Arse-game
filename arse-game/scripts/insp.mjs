function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {GLTFLoader}=await import("three/addons/loaders/GLTFLoader.js");
const fs=await import("node:fs");
const f=process.argv[2];
const buf=fs.readFileSync(f);
const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
console.log("FILE:",f);
for(const a of gltf.animations)console.log(`  clip "${a.name}" dur=${a.duration.toFixed(2)}s tracks=${a.tracks.length}`);
const bones=[];gltf.scene.traverse(o=>{if(o.isBone)bones.push(o.name)});
console.log("bones("+bones.length+"):",bones.slice(0,40).join(","));
// rest pose: hips height + facing
const F=n=>{let f=null;gltf.scene.traverse(o=>{if(!f&&o.name===n)f=o});return f};
gltf.scene.updateMatrixWorld(true);
const hips=F(bones.find(n=>/hip/i.test(n)));
if(hips){const v=new THREE.Vector3();hips.getWorldPosition(v);console.log("hips rest pos:",v.toArray().map(x=>x.toFixed(2)).join(","))}
const bb=new THREE.Box3().setFromObject(gltf.scene);const s=bb.getSize(new THREE.Vector3());
console.log("bbox:",s.toArray().map(x=>x.toFixed(2)).join(","));
