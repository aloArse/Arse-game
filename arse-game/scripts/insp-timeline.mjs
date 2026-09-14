// Timeline sampler for candidate FBX. Run: node scripts/insp-timeline.mjs
function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
const SRC="/home/user/animsrc/";
const FILES=(process.argv[2]||"Liam@flying.fbx,Liam@standing_dive_forward.fbx,Liam@hurricane_kick.fbx,Liam@jump.fbx,Liam@jumping_out_of_a_plane.fbx,Liam@carrying.fbx").split(",");
const f2=n=>n.toFixed(2);
for(const f of FILES){
  const buf=fs.readFileSync(SRC+f);
  const obj=new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
  const clip=obj.animations[0];
  const S=n=>{let r=null;obj.traverse(o=>{if(!r&&o.name===`mixamorig${n}`)r=o});return r};
  const mixer=new THREE.AnimationMixer(obj);mixer.clipAction(clip).play();
  console.log(`=== ${f} dur=${clip.duration.toFixed(2)} ===`);
  const NS=13;
  for(let i=0;i<NS;i++){
    const t=Math.min(clip.duration*i/(NS-1),clip.duration-0.0005);
    mixer.setTime(t);obj.updateMatrixWorld(true);
    const hp=S("Hips").getWorldPosition(new THREE.Vector3());
    const hq=S("Hips").getWorldQuaternion(new THREE.Quaternion());
    const fwd=new THREE.Vector3(0,0,1).applyQuaternion(hq),up=new THREE.Vector3(0,1,0).applyQuaternion(hq);
    const rel=n=>S(n).getWorldPosition(new THREE.Vector3()).sub(hp).divideScalar(100);
    const hL=rel("LeftHand"),hR=rel("RightHand"),fL=rel("LeftFoot"),fR=rel("RightFoot");
    const yaw=Math.atan2(fwd.x,fwd.z)*57.3;
    console.log(`t=${t.toFixed(2)} hipsY=${f2(hp.y/100)} yaw=${yaw.toFixed(0)} up=(${f2(up.x)},${f2(up.y)},${f2(up.z)}) hL=(${f2(hL.x)},${f2(hL.y)},${f2(hL.z)}) hR=(${f2(hR.x)},${f2(hR.y)},${f2(hR.z)}) fL=(${f2(fL.x)},${f2(fL.y)},${f2(fL.z)}) fR=(${f2(fR.x)},${f2(fR.y)},${f2(fR.z)})`);
  }
}
