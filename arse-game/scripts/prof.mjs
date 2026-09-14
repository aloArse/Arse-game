function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
function load(f){
  const buf=fs.readFileSync("/home/user/animsrc/"+f);
  const obj=new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
  return obj;
}
const F=(obj,n)=>{let r=null;obj.traverse(o=>{if(!r&&o.name===n)r=o});return r};
const wp=(obj,n)=>{const v=new THREE.Vector3();F(obj,n).getWorldPosition(v);return v};
// facing: hips z at start vs end of walk
{
  const o=load("Liam@walking.fbx");const c=o.animations[0];
  const m=new THREE.AnimationMixer(o);m.clipAction(c).play();
  m.setTime(0.01);o.updateMatrixWorld(true);const z0=wp(o,"mixamorigHips").z;
  m.setTime(c.duration-0.01);o.updateMatrixWorld(true);const z1=wp(o,"mixamorigHips").z;
  console.log("walk travel z:",z0.toFixed(0),"->",z1.toFixed(0), z1>z0?"(+Z fwd ✓)":"(-Z fwd ✗)");
}
// flying arms: shoulder->hand dirs at mid clip
{
  const o=load("Liam@flying.fbx");const c=o.animations[0];
  const m=new THREE.AnimationMixer(o);m.clipAction(c).play();
  m.setTime(c.duration/2);o.updateMatrixWorld(true);
  for(const s of ["Left","Right"]){
    const d=wp(o,`mixamorig${s}Hand`).sub(wp(o,`mixamorig${s}Arm`)).normalize();
    console.log(`flying ${s} arm dir:`,d.toArray().map(x=>x.toFixed(2)).join(","));
  }
  const hips=wp(o,"mixamorigHips"),head=wp(o,"mixamorigHead");
  console.log("flying hipsY:",hips.y.toFixed(0),"head-hips:",head.clone().sub(hips).toArray().map(x=>x.toFixed(0)).join(","));
}
// impact profiles: hand speed over time for strikes/casts
for(const f of ["Liam@punching.fbx","Liam@punch_combo.fbx","Liam@cross_punch.fbx","Liam@hook_punch.fbx","Liam@jab_cross.fbx","Liam@mma_kick.fbx","Liam@Standing_1H_Magic_Attack_01.fbx","Liam@Standing_2H_Magic_Attack_01.fbx","Liam@bash.fbx","Liam@throw.fbx","Liam@clapping.fbx"]){
  const o=load(f);const c=o.animations[0];
  const m=new THREE.AnimationMixer(o);m.clipAction(c).play();
  const N=12;let prev=null,peak=0,peakT=0;const speeds=[];
  for(let i=0;i<=N;i++){
    m.setTime(c.duration*i/N);o.updateMatrixWorld(true);
    const p=wp(o,/kick|mma/i.test(f)?"mixamorigRightFoot":"mixamorigRightHand");
    if(prev){const s=p.distanceTo(prev)/(c.duration/N);speeds.push(s);if(s>peak){peak=s;peakT=c.duration*i/N}}
    prev=p.clone();
  }
  console.log(`${f} dur=${c.duration.toFixed(2)} peakHand=${peak.toFixed(0)}u/s at t=${peakT.toFixed(2)}`);
}
