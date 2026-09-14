function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
function load(f){const b=fs.readFileSync("/home/user/animsrc/"+f);
  return new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),"")}
const F=(o,n)=>{let r=null;o.traverse(x=>{if(!r&&x.name===n)r=x});return r};
function prof(f,pts){
  const o=load(f);const c=o.animations[0];
  const m=new THREE.AnimationMixer(o);m.clipAction(c).play();
  console.log(`--- ${f} dur=${c.duration.toFixed(2)}`);
  for(const t of pts){
    m.setTime(Math.min(t,c.duration-0.001));o.updateMatrixWorld(true);
    const P=n=>{const v=new THREE.Vector3();F(o,n).getWorldPosition(v);return v};
    const hips=P("mixamorigHips");
    const rel=n=>P(n).sub(hips).toArray().map(x=>x.toFixed(0)).join(",");
    console.log(`  t=${t.toFixed(2)} RHand=(${rel("mixamorigRightHand")}) LHand=(${rel("mixamorigLeftHand")}) RFoot=(${rel("mixamorigRightFoot")}) hipsY=${hips.y.toFixed(0)}`);
  }
}
// handedness: which hand goes furthest forward at impact?
prof("Liam@punching.fbx",[0.0,0.29,0.6]);
prof("Liam@cross_punch.fbx",[0.0,1.0,1.7]);
prof("Liam@elbow_uppercut_combo.fbx",[0.0,1.0,2.0,3.0,3.8]);
prof("Liam@grab_and_slam.fbx",[0.0,1.0,2.0,3.0]);
prof("Liam@charge.fbx",[0.0,0.5,1.0]);
prof("Liam@throw.fbx",[0.0,0.5,0.92,1.5]);
prof("Liam@Standing_1H_Magic_Attack_01.fbx",[0.0,0.96,1.5]);
prof("Liam@bash.fbx",[0.0,1.0,1.67,2.5]);
prof("Liam@blocking.fbx",[0.6]);
prof("Liam@landing.fbx",[0.5,1.0,1.5,2.0]);
