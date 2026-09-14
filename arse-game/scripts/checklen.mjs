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
const bones=ANIMS.bones;
const P=n=>{const v=new THREE.Vector3();F(n).getWorldPosition(v);return v};
// rest lengths
const SEGS=[["upper_armR_027","forearmR_028"],["forearmR_028","handR_029"],["thighR_049","shinR_050"],["shinR_050","footR_051"],["upper_armL_08","forearmL_09"],["thighL_045","shinL_046"]];
const rest={};for(const [a,b]of SEGS)rest[a+">"+b]=P(a).distanceTo(P(b));
console.log("rest lens:",Object.entries(rest).map(([k,v])=>`${k}=${v.toFixed(3)}`).join(" "));
const restHips=F("Hips_01").position.clone();
let worst=0,worstWhere="";
for(const [name,c]of Object.entries(ANIMS.clips)){
  for(let i=0;i<c.frames.length;i+=3){
    const fr=c.frames[i];
    bones.forEach((bn,bi)=>{F(bn).quaternion.set(fr[bi*4],fr[bi*4+1],fr[bi*4+2],fr[bi*4+3])});
    const h=c.hips[i];F("Hips_01").position.set(restHips.x+h[0],restHips.y+h[1],restHips.z+h[2]);
    scene.updateMatrixWorld(true);
    for(const [a,b]of SEGS){
      const d=P(a).distanceTo(P(b));const dev=Math.abs(d-rest[a+">"+b])/rest[a+">"+b];
      if(dev>worst){worst=dev;worstWhere=`${name}@${i} ${a}>${b} ${d.toFixed(3)} vs ${rest[a+">"+b].toFixed(3)}`}
    }
  }
}
console.log("worst length deviation:",(worst*100).toFixed(2)+"%",worstWhere);
// punch reach breakdown
{
  const c=ANIMS.clips.punch;const fr=c.frames[8];
  bones.forEach((bn,bi)=>{F(bn).quaternion.set(fr[bi*4],fr[bi*4+1],fr[bi*4+2],fr[bi*4+3])});
  scene.updateMatrixWorld(true);
  console.log("punch@8 fist.z-hips.z=",(P("handR_029").z-P("Hips_01").z).toFixed(2),
    "shoulder.z=",(P("upper_armR_027").z-P("Hips_01").z).toFixed(2),
    "armLen=",P("upper_armR_027").distanceTo(P("handR_029")).toFixed(2));
}
