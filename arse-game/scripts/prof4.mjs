function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
const b=fs.readFileSync("/home/user/animsrc/Liam@mma_kick.fbx");
const o=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),"");
const c=o.animations[0];const m=new THREE.AnimationMixer(o);m.clipAction(c).play();
const F=n=>{let r=null;o.traverse(x=>{if(!r&&x.name===n)r=x});return r};
console.log("dur=",c.duration.toFixed(2));
for(let t=0;t<=1.61;t+=0.2){
  m.setTime(Math.min(t,c.duration-0.001));o.updateMatrixWorld(true);
  const P=n=>{const v=new THREE.Vector3();F(n).getWorldPosition(v);return v};
  const h=P("mixamorigHips");
  console.log(`t=${t.toFixed(1)} RFoot=(${P("mixamorigRightFoot").sub(h).toArray().map(x=>x.toFixed(0))}) LFoot=(${P("mixamorigLeftFoot").sub(h).toArray().map(x=>x.toFixed(0))}) hipsY=${h.y.toFixed(0)}`);
}
