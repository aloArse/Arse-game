function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
const f=process.argv[2];
const buf=fs.readFileSync(f);
const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
const obj=new FBXLoader().parse(ab,"");
console.log("FILE:",f);
for(const a of obj.animations)console.log(`  clip "${a.name}" dur=${a.duration.toFixed(2)}s tracks=${a.tracks.length}`);
const bones=[];obj.traverse(o=>{if(o.isBone)bones.push(o.name)});
console.log("bones("+bones.length+"):",bones.slice(0,20).join(","));
