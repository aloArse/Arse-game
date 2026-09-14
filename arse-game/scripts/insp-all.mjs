function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
const files=fs.readdirSync("/home/user/animsrc").filter(f=>f.endsWith(".fbx")).sort();
for(const f of files){
  const buf=fs.readFileSync("/home/user/animsrc/"+f);
  const obj=new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
  const clip=obj.animations[0];
  if(!clip){console.log(f,"NO CLIP");continue}
  const F=n=>{let r=null;obj.traverse(o=>{if(!r&&o.name===n)r=o});return r};
  const hips=F("mixamorigHips");
  const mixer=new THREE.AnimationMixer(obj);mixer.clipAction(clip).play();
  mixer.setTime(0.001);obj.updateMatrixWorld(true);
  const p0=hips.position.clone();const q0=hips.quaternion.clone();
  const handL0=new THREE.Vector3();F("mixamorigLeftHand").getWorldPosition(handL0);
  mixer.setTime(clip.duration-0.001);obj.updateMatrixWorld(true);
  const p1=hips.position.clone();const snap=hips.quaternion.angleTo(q0)*57.3;
  // root travel: sample 8 points
  let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9,minY=1e9,maxY=-1e9;
  for(let i=0;i<=8;i++){mixer.setTime(clip.duration*i/8);obj.updateMatrixWorld(true);
    const p=hips.position;minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
    minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)}
  console.log(`${f} dur=${clip.duration.toFixed(2)} trk=${clip.tracks.length} hipsY=${p0.y.toFixed(2)} dx=${(maxX-minX).toFixed(2)} dy=${(maxY-minY).toFixed(2)} dz=${(maxZ-minZ).toFixed(2)} snap=${snap.toFixed(1)} handL.x=${handL0.x.toFixed(2)}`);
}
