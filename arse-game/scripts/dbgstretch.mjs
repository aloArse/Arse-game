function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {GLTFLoader}=await import("three/addons/loaders/GLTFLoader.js");
const fs=await import("node:fs");
const buf=fs.readFileSync("src/assets/invincible.glb");
const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
const scene=gltf.scene;scene.updateMatrixWorld(true);
const F=n=>{let r=null;scene.traverse(o=>{if(!r&&o.name===n)r=o});return r};
const ANIMS=JSON.parse(fs.readFileSync("src/assets/anims.json","utf8"));
// chain local scales thighR up to root
console.log("=== local scales up chain from shinR_050 ===");
let x=F("shinR_050");while(x){console.log(x.type,x.name,`pos=(${x.position.x.toFixed(2)},${x.position.y.toFixed(2)},${x.position.z.toFixed(2)})`,`scale=(${x.scale.x},${x.scale.y},${x.scale.z})`);x=x.parent}
// check baked quat norms
let mn=1e9,mx=0;
for(const [name,c]of Object.entries(ANIMS.clips))for(const fr of c.frames)for(let b=0;b<52;b++){
  const n=Math.hypot(fr[b*4],fr[b*4+1],fr[b*4+2],fr[b*4+3]);if(n<mn)mn=n;if(n>mx)mx=n}
console.log("baked quat norms: min=",mn.toFixed(4),"max=",mx.toFixed(4));
// now pose hookFlurry@0 on ONLY thigh chain vs full pose
function setPose(name,idx){
  const c=ANIMS.clips[name];const fr=c.frames[idx];
  ANIMS.bones.forEach((bn,bi)=>{F(bn).quaternion.set(fr[bi*4],fr[bi*4+1],fr[bi*4+2],fr[bi*4+3])});
  scene.updateMatrixWorld(true);
}
const P=n=>{const v=new THREE.Vector3();F(n).getWorldPosition(v);return v};
console.log("rest thigh-shin:",P("thighR_049").distanceTo(P("shinR_050")).toFixed(3));
setPose("hookFlurry",0);
console.log("hook@0 thigh-shin:",P("thighR_049").distanceTo(P("shinR_050")).toFixed(3));
const d=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
F("shinR_050").matrixWorld.decompose(d,q,s);
console.log("shinR world scale:",s.x.toFixed(3),s.y.toFixed(3),s.z.toFixed(3));
F("thighR_049").matrixWorld.decompose(d,q,s);
console.log("thighR world scale:",s.x.toFixed(3),s.y.toFixed(3),s.z.toFixed(3));
// local offset shin in thigh frame
const th=F("thighR_049"),sh=F("shinR_050");
console.log("shin local pos:",sh.position.x.toFixed(3),sh.position.y.toFixed(3),sh.position.z.toFixed(3),"local scale:",sh.scale.x,sh.scale.y,sh.scale.z);
console.log("thigh local quat:",th.quaternion.x.toFixed(3),th.quaternion.y.toFixed(3),th.quaternion.z.toFixed(3),th.quaternion.w.toFixed(3),"norm=",th.quaternion.length().toFixed(4));
