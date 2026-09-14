function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
function load(f){const b=fs.readFileSync("/home/user/animsrc/"+f);return new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),"")}
const S=(o,n)=>{let r=null;o.traverse(x=>{if(!r&&x.name==="mixamorig"+n)r=x});return r};
// hand speed peaks (impact) for cross + uppercut + cast1
for(const [f,hand]of [["Liam@cross_punch.fbx","RightHand"],["Liam@elbow_uppercut_combo.fbx","RightHand"],["Liam@Standing_1H_Magic_Attack_01.fbx","RightHand"]]){
  const o=load(f),clip=o.animations[0],mx=new THREE.AnimationMixer(o);mx.clipAction(clip).play();
  const P=t=>{mx.setTime(Math.min(t,clip.duration-0.001));o.updateMatrixWorld(true);const v=new THREE.Vector3();S(o,hand).getWorldPosition(v);return v};
  let prev=P(0),rows=[];
  for(let t=0.05;t<clip.duration-0.02;t+=0.05){const p=P(t);rows.push([t,(p.distanceTo(prev)/0.05).toFixed(0),p.z.toFixed(0),p.y.toFixed(0)]);prev=p}
  console.log("===",f,"dur="+clip.duration.toFixed(2));
  console.log(rows.map(r=>`${r[0].toFixed(2)}s v=${r[1]} z=${r[2]} y=${r[3]}`).join("\n"));
}
// footfall phases for walk/run/sprint: toe Y minima
for(const f of ["Liam@walking.fbx","Liam@running.fbx","Liam@Standing_Sprint_Forward.fbx"]){
  const o=load(f),clip=o.animations[0],mx=new THREE.AnimationMixer(o);mx.clipAction(clip).play();
  const T=(b,t)=>{mx.setTime(Math.min(t,clip.duration-0.001));o.updateMatrixWorld(true);const v=new THREE.Vector3();S(o,b).getWorldPosition(v);return v.y};
  for(const toe of ["LeftToeBase","RightToeBase"]){
    const ys=[];for(let i=0;i<48;i++)ys.push(T(toe,clip.duration*i/48));
    const mins=[];for(let i=0;i<48;i++){const a=ys[(i+47)%48],b=ys[i],c=ys[(i+1)%48];if(b<=a&&b<=c)mins.push((i/48).toFixed(2))}
    console.log(f,toe,"dur="+clip.duration.toFixed(2),"toeY minima @cycle:",mins.join(","));
  }
}
