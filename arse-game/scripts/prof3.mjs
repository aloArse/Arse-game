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
function prof(f,t0,t1,step){
  const o=load(f);const c=o.animations[0];
  const m=new THREE.AnimationMixer(o);m.clipAction(c).play();
  console.log(`--- ${f} dur=${c.duration.toFixed(2)}`);
  for(let t=t0;t<=t1+1e-6;t+=step){
    m.setTime(Math.min(t,c.duration-0.001));o.updateMatrixWorld(true);
    const P=n=>{const v=new THREE.Vector3();F(o,n).getWorldPosition(v);return v};
    const hips=P("mixamorigHips");
    const rel=n=>P(n).sub(hips).toArray().map(x=>x.toFixed(0)).join(",");
    console.log(`  t=${t.toFixed(2)} R=(${rel("mixamorigRightHand")}) L=(${rel("mixamorigLeftHand")})`);
  }
}
prof("Liam@elbow_uppercut_combo.fbx",0.0,2.4,0.3);
prof("Liam@bash.fbx",0.5,3.0,0.5);
prof("Liam@charge.fbx",0.0,2.0,0.5);
prof("Liam@hook_punch.fbx",0.0,2.1,0.5);
prof("Liam@jab_cross.fbx",0.0,2.2,0.55);
prof("Liam@fight_idle.fbx",1.0,1.0,1);
prof("Liam@Standing_2H_Magic_Attack_01.fbx",0.5,2.0,0.5);
