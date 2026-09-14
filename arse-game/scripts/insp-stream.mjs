// Streamline search: hips-frame limb dirs + straightness + loop snap.
// Run: node scripts/insp-stream.mjs "Liam@hanging_idle.fbx,..."
function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
const SRC="/home/user/animsrc/";
const FILES=(process.argv[2]||"Liam@hanging_idle.fbx,Liam@hanging.fbx,Liam@run_to_dive.fbx,Liam@standing_dive_forward.fbx").split(",");
const f2=n=>n.toFixed(2);
for(const f of FILES){
  const buf=fs.readFileSync(SRC+f);
  const obj=new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
  const clip=obj.animations[0];
  const S=n=>{let r=null;obj.traverse(o=>{if(!r&&o.name===`mixamorig${n}`)r=o});return r};
  const mixer=new THREE.AnimationMixer(obj);mixer.clipAction(clip).play();
  console.log(`=== ${f} dur=${clip.duration.toFixed(2)} ===`);
  const NS=17;
  for(let i=0;i<NS;i++){
    const t=Math.min(clip.duration*i/(NS-1),clip.duration-0.0005);
    mixer.setTime(t);obj.updateMatrixWorld(true);
    const hp=S("Hips").getWorldPosition(new THREE.Vector3());
    const hqi=S("Hips").getWorldQuaternion(new THREE.Quaternion()).invert();
    const loc=n=>S(n).getWorldPosition(new THREE.Vector3()).sub(hp).applyQuaternion(hqi).divideScalar(100);
    const hL=loc("LeftHand"),hR=loc("RightHand"),fL=loc("LeftFoot"),fR=loc("RightFoot"),hd=loc("Head");
    const el=(a,b,c)=>{const u=S(b).getWorldPosition(new THREE.Vector3()).sub(S(a).getWorldPosition(new THREE.Vector3())).normalize();const v=S(c).getWorldPosition(new THREE.Vector3()).sub(S(b).getWorldPosition(new THREE.Vector3())).normalize();return Math.acos(Math.min(1,u.dot(v)))*57.3};
    const elL=el("LeftArm","LeftForeArm","LeftHand"),elR=el("RightArm","RightForeArm","RightHand");
    const knL=el("LeftUpLeg","LeftLeg","LeftFoot"),knR=el("RightUpLeg","RightLeg","RightFoot");
    const together=Math.hypot(hL.x-hR.x,hL.y-hR.y,hL.z-hR.z);
    console.log(`t=${t.toFixed(2)} hL=(${f2(hL.x)},${f2(hL.y)},${f2(hL.z)}) hR=(${f2(hR.x)},${f2(hR.y)},${f2(hR.z)}) tog=${f2(together)} fL=(${f2(fL.x)},${f2(fL.y)},${f2(fL.z)}) fR=(${f2(fR.x)},${f2(fR.y)},${f2(fR.z)}) head=(${f2(hd.x)},${f2(hd.y)},${f2(hd.z)}) elb=${elL.toFixed(0)}/${elR.toFixed(0)}deg knee=${knL.toFixed(0)}/${knR.toFixed(0)}deg`);
  }
  mixer.setTime(0.0005);obj.updateMatrixWorld(true);
  const q0={};obj.traverse(o=>{if(o.isBone)q0[o.name]=o.quaternion.clone()});
  mixer.setTime(clip.duration-0.0005);obj.updateMatrixWorld(true);
  let snap=0;obj.traverse(o=>{if(o.isBone)snap=Math.max(snap,q0[o.name].angleTo(o.quaternion)*57.3)});
  console.log(`  FULL-FILE snap=${snap.toFixed(1)}deg`);
}
