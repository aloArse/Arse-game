// Deep-inspect candidate Mixamo FBX: bone coverage, root motion, body orientation,
// limb shape at mid-clip, loop snap. Run: node scripts/insp-new.mjs
function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
const SRC="/home/user/animsrc/";
const FILES=["Liam@flying.fbx","Liam@floating.fbx","Liam@standing_dive_forward.fbx","Liam@hurricane_kick.fbx","Liam@jumping_up.fbx","Liam@jump.fbx","Liam@jumping_out_of_a_plane.fbx","Liam@fall_a_loop.fbx","Liam@carrying.fbx"];
const NEED=["Hips","Spine","Spine1","Spine2","Neck","Head","LeftShoulder","LeftArm","LeftForeArm","LeftHand","LeftUpLeg","LeftLeg","LeftFoot","LeftToeBase","RightShoulder","RightArm","RightForeArm","RightHand","RightUpLeg","RightLeg","RightFoot","RightToeBase"];
for(const f of FILES){
  const buf=fs.readFileSync(SRC+f);
  const obj=new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
  const clip=obj.animations[0];
  const S=n=>{let r=null;obj.traverse(o=>{if(!r&&o.name===`mixamorig${n}`)r=o});return r};
  const miss=NEED.filter(n=>!S(n));
  const mixer=new THREE.AnimationMixer(obj);mixer.clipAction(clip).play();
  obj.updateMatrixWorld(true);
  const P=n=>{const v=new THREE.Vector3();S(n).getWorldPosition(v);return v};
  const Q=n=>S(n).getWorldQuaternion(new THREE.Quaternion());
  // sample timeline: hips pos + hips forward(+Z)/up(+Y) world dirs
  const NS=9;let minY=1e9,maxY=-1e9,hx0=0,hz0=0,hx1=0,hz1=0;
  let midInfo="";
  for(let i=0;i<NS;i++){
    mixer.setTime(Math.min(clip.duration*i/(NS-1),clip.duration-0.0005));obj.updateMatrixWorld(true);
    const hp=P("Hips"),hq=Q("Hips");
    minY=Math.min(minY,hp.y);maxY=Math.max(maxY,hp.y);
    if(i===0){hx0=hp.x;hz0=hp.z}if(i===NS-1){hx1=hp.x;hz1=hp.z}
    if(i===Math.floor(NS/2)){
      const fwd=new THREE.Vector3(0,0,1).applyQuaternion(hq),up=new THREE.Vector3(0,1,0).applyQuaternion(hq);
      const hL=P("LeftHand").sub(hp).divideScalar(100),hR=P("RightHand").sub(hp).divideScalar(100);
      const fL=P("LeftFoot").sub(hp).divideScalar(100),fR=P("RightFoot").sub(hp).divideScalar(100);
      midInfo=`hipsFwd=(${fwd.x.toFixed(2)},${fwd.y.toFixed(2)},${fwd.z.toFixed(2)}) hipsUp=(${up.x.toFixed(2)},${up.y.toFixed(2)},${up.z.toFixed(2)}) handsL=(${hL.x.toFixed(2)},${hL.y.toFixed(2)},${hL.z.toFixed(2)}) handsR=(${hR.x.toFixed(2)},${hR.y.toFixed(2)},${hR.z.toFixed(2)}) feetL=(${fL.x.toFixed(2)},${fL.y.toFixed(2)},${fL.z.toFixed(2)}) feetR=(${fR.x.toFixed(2)},${fR.y.toFixed(2)},${fR.z.toFixed(2)})`;
    }
  }
  // loop snap: max joint angle between t=0 and t=end
  mixer.setTime(0.0005);obj.updateMatrixWorld(true);
  const q0={};obj.traverse(o=>{if(o.isBone)q0[o.name]=o.getWorldQuaternion(new THREE.Quaternion())});
  mixer.setTime(clip.duration-0.0005);obj.updateMatrixWorld(true);
  let snap=0;obj.traverse(o=>{if(o.isBone)snap=Math.max(snap,q0[o.name].angleTo(o.getWorldQuaternion(new THREE.Quaternion()))*57.3)});
  console.log(`FILE ${f} dur=${clip.duration.toFixed(2)}s miss=[${miss.join(",")||"none"}]`);
  console.log(`  hipsY range: ${(minY/100).toFixed(2)}..${(maxY/100).toFixed(2)}m travelXZ=${(Math.hypot(hx1-hx0,hz1-hz0)/100).toFixed(2)}m snap=${snap.toFixed(1)}deg`);
  console.log(`  mid: ${midInfo}`);
}
