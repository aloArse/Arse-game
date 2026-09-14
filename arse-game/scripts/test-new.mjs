// Verify the 4 new flight/ability mocap clips (flyM/swimM/spinM/grabM).
// Run: node scripts/test-new.mjs
function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {GLTFLoader}=await import("three/addons/loaders/GLTFLoader.js");
const fs=await import("node:fs");
let failures=0;
const check=(n,ok,info="")=>{console.log(`${ok?"PASS":"FAIL"}  ${n}${info?" — "+info:""}`);if(!ok)failures++};
const buf=fs.readFileSync("src/assets/invincible.glb");
const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
const scene=gltf.scene;scene.updateMatrixWorld(true);
const F=n=>{let r=null;scene.traverse(o=>{if(!r&&o.name===n)r=o});return r};
const A=JSON.parse(fs.readFileSync("src/assets/anims.json","utf8"));
const bones=A.bones,restHips=F("Hips_01").position.clone();
const _a=new THREE.Quaternion(),_b=new THREE.Quaternion();
function pose(clip,t){
  const c=A.clips[clip];
  const tt=((t%c.dur)+c.dur)%c.dur;
  const f=(tt/c.dur)*(c.frames.length-1);
  const i0=Math.floor(f),i1=Math.min(c.frames.length-1,i0+1),u=f-i0;
  const F0=c.frames[i0],F1=c.frames[i1];
  bones.forEach((bn,bi)=>{
    _a.set(F0[bi*4],F0[bi*4+1],F0[bi*4+2],F0[bi*4+3]);
    _b.set(F1[bi*4],F1[bi*4+1],F1[bi*4+2],F1[bi*4+3]);
    if(_a.dot(_b)<0){_b.x*=-1;_b.y*=-1;_b.z*=-1;_b.w*=-1}
    F(bn).quaternion.set(_a.x+(_b.x-_a.x)*u,_a.y+(_b.y-_a.y)*u,_a.z+(_b.z-_a.z)*u,_a.w+(_b.w-_a.w)*u).normalize();
  });
  const H0=c.hips[i0],H1=c.hips[i1];
  F("Hips_01").position.set(restHips.x+H0[0]+(H1[0]-H0[0])*u,restHips.y+H0[1]+(H1[1]-H0[1])*u,restHips.z+H0[2]+(H1[2]-H0[2])*u);
  scene.updateMatrixWorld(true);
}
const P=n=>{const v=new THREE.Vector3();F(n).getWorldPosition(v);return v};
const hipsQ=()=>F("Hips_01").getWorldQuaternion(new THREE.Quaternion());
const range=a=>Math.max(...a)-Math.min(...a);
function jointLines(tol=0.35){
  const bad=[];const hq=hipsQ().invert();
  for(const [hip,knee,ank,want,tag]of[["thighL_045","shinL_046","footL_047",1,"kneeL"],["thighR_049","shinR_050","footR_051",1,"kneeR"],["upper_armL_08","forearmL_09","handL_010",-1,"elbowL"],["upper_armR_027","forearmR_028","handR_029",-1,"elbowR"]]){
    const a=P(hip),b=P(knee),c=P(ank);
    const axis=c.clone().sub(a);axis.normalize();
    const off=b.clone().sub(a).addScaledVector(axis,-(b.clone().sub(a).dot(axis)));
    if(off.length()>0.02){off.applyQuaternion(hq);const f=off.z/off.length();
      if(want>0&&f<-0.35)bad.push(`${tag}(${f.toFixed(2)})`);
      if(want<0&&f>tol)bad.push(`${tag}(${f.toFixed(2)})`)}
  }
  return bad;
}
const stripped=c=>{let m=0;for(const h of A.clips[c].hips)m=Math.max(m,Math.hypot(h[0],h[2]));return m};
// ---- flyM: superman cruise, face-down horizontal, arms out, legs trail ----
{
  const N=16;let minUpZ=1,spread=0,trail=0,headF=0,bad=[];
  for(let i=0;i<N;i++){pose("flyM",(A.clips.flyM.dur*i)/N);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(hipsQ());minUpZ=Math.min(minUpZ,up.z);
    spread=Math.max(spread,Math.abs(P("handL_010").x-P("handR_029").x));
    trail=Math.max(trail,P("Hips_01").z-P("footL_047").z,P("Hips_01").z-P("footR_051").z);
    headF=Math.max(headF,P("Head_06").z-P("Hips_01").z);
    bad=bad.concat(jointLines().map(j=>`flyM@${i}:${j}`));}
  check("flyM: body horizontal face-down",minUpZ>0.85,`minUpZ=${minUpZ.toFixed(2)}`);
  check("flyM: arms spread wide",spread>1.0,`spread=${spread.toFixed(2)}m`);
  check("flyM: legs trail behind",trail>0.8,`trail=${trail.toFixed(2)}m`);
  check("flyM: head leads forward",headF>0.2,`headF=${headF.toFixed(2)}m`);
  check("flyM: loops cleanly",A.clips.flyM.snap<3,`snap=${A.clips.flyM.snap}°`);
  check("flyM: root travel stripped",stripped("flyM")<0.05,`${stripped("flyM").toFixed(3)}m`);
  check("flyM: joints sane",bad.length===0,bad.slice(0,3).join(" "));
}
// ---- swimM: breaststroke flight, horizontal, arms sweep, legs kick ----
{
  const N=24,hLz=[],hRz=[],fx=[],fy=[];let minUpZ=1,bad=[];
  for(let i=0;i<N;i++){pose("swimM",(A.clips.swimM.dur*i)/N);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(hipsQ());minUpZ=Math.min(minUpZ,up.z);
    const hips=P("Hips_01");
    hLz.push(P("handL_010").z-hips.z);hRz.push(P("handR_029").z-hips.z);
    fx.push(P("footL_047").x-P("footR_051").x);fy.push(P("footL_047").y-hips.y);
    bad=bad.concat(jointLines().map(j=>`swimM@${i}:${j}`));}
  const corr=(a,b)=>{const ma=a.reduce((s,v)=>s+v,0)/a.length,mb=b.reduce((s,v)=>s+v,0)/b.length;let s=0,sa=0,sb=0;for(let i=0;i<a.length;i++){s+=(a[i]-ma)*(b[i]-mb);sa+=(a[i]-ma)**2;sb+=(b[i]-mb)**2}return s/Math.sqrt(sa*sb+1e-9)};
  check("swimM: body horizontal face-down",minUpZ>0.85,`minUpZ=${minUpZ.toFixed(2)}`);
  check("swimM: arms sweep fwd-back",range(hLz)>0.5&&range(hRz)>0.5,`L=${range(hLz).toFixed(2)} R=${range(hRz).toFixed(2)}m`);
  check("swimM: breaststroke symmetric",corr(hLz,hRz)>0.7,`corr=${corr(hLz,hRz).toFixed(2)}`);
  check("swimM: legs kick",range(fx)>0.3||range(fy)>0.3,`spread=${range(fx).toFixed(2)} lift=${range(fy).toFixed(2)}`);
  check("swimM: loops cleanly",A.clips.swimM.snap<3,`snap=${A.clips.swimM.snap}°`);
  check("swimM: root travel stripped",stripped("swimM")<0.05,`${stripped("swimM").toFixed(3)}m`);
  check("swimM: joints sane",bad.length===0,bad.slice(0,3).join(" "));
}
// ---- spinM: airborne 360° spinning kick, upright ----
{
  const N=16;let minUpY=1,travel=0,prev=null,kick=0,bad=[];
  for(let i=0;i<=N;i++){pose("spinM",(A.clips.spinM.dur*i)/N);
    const hq=hipsQ();const up=new THREE.Vector3(0,1,0).applyQuaternion(hq);minUpY=Math.min(minUpY,up.y);
    const fwd=new THREE.Vector3(0,0,1).applyQuaternion(hq);
    const yaw=Math.atan2(fwd.x,fwd.z);
    if(prev!==null){let d=yaw-prev;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;travel+=d}
    prev=yaw;
    const hqi=hq.clone().invert();
    for(const f of ["footL_047","footR_051"]){
      const rel=P(f).sub(P("Hips_01")).applyQuaternion(hqi);
      kick=Math.max(kick,Math.hypot(rel.x,rel.z));}
    bad=bad.concat(jointLines(0.6).map(j=>`spinM@${i}:${j}`));}
  check("spinM: stays upright",minUpY>0.9,`minUpY=${minUpY.toFixed(2)}`);
  check("spinM: full 360° whirl",Math.abs(Math.abs(travel)-Math.PI*2)<Math.PI*2*0.25,`travel=${(travel*57.3).toFixed(0)}°`);
  check("spinM: kick leg extended",kick>1.0,`reach=${kick.toFixed(2)}m`);
  check("spinM: loops cleanly",A.clips.spinM.snap<3,`snap=${A.clips.spinM.snap}°`);
  check("spinM: root stripped",stripped("spinM")<0.01&&A.clips.spinM.hips.every(h=>h[1]===0),`${stripped("spinM").toFixed(3)}m`);
  check("spinM: joints sane",bad.length===0,bad.slice(0,3).join(" "));
}
// ---- grabM: upright carry hold, hands cradle forward ----
{
  const N=8;let minUpY=1,minHz=99,maxChest=0,bad=[];
  for(let i=0;i<N;i++){pose("grabM",(A.clips.grabM.dur*i)/N);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(hipsQ());minUpY=Math.min(minUpY,up.y);
    const hips=P("Hips_01"),chest=P("Chest_04");
    minHz=Math.min(minHz,P("handL_010").z-hips.z,P("handR_029").z-hips.z);
    maxChest=Math.max(maxChest,Math.abs(P("handL_010").y-chest.y),Math.abs(P("handR_029").y-chest.y));
    bad=bad.concat(jointLines().map(j=>`grabM@${i}:${j}`));}
  check("grabM: stays upright",minUpY>0.9,`minUpY=${minUpY.toFixed(2)}`);
  check("grabM: hands cradle forward",minHz>0.15,`minFwd=${minHz.toFixed(2)}m`);
  check("grabM: hands at chest height",maxChest<0.45,`maxOff=${maxChest.toFixed(2)}m`);
  check("grabM: loops cleanly",A.clips.grabM.snap<4,`snap=${A.clips.grabM.snap}°`);
  check("grabM: joints sane",bad.length===0,bad.slice(0,3).join(" "));
}
console.log(failures?`\n${failures} FAILURES`:"\nALL NEW-CLIP CHECKS PASSED");
process.exit(failures?1:0);
