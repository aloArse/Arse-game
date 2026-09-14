// Stick-figure renderer (pure math -> PNG, no GL): compares source FBX vs baked
// clips vs in-game presentation (pitch+gaze). Run: node scripts/stick-render.mjs
function makeImg(){const l={};const i={width:4,height:4,complete:false,_src:"",style:{},
addEventListener(t,f){(l[t]=l[t]||[]).push(f)},removeEventListener(t,f){l[t]=(l[t]||[]).filter(x=>x!==f)},
set src(v){i._src=v;setTimeout(()=>{i.complete=true;for(const f of l.load||[])f.call(i)},0)},get src(){return i._src}};return i}
globalThis.document={createElementNS:()=>makeImg()};globalThis.self=globalThis;
const THREE=await import("three");
const {GLTFLoader}=await import("three/addons/loaders/GLTFLoader.js");
const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
const fs=await import("node:fs");
const zlib=await import("node:zlib");

// ---------- tiny PNG writer ----------
const W=1560,H=1060,px=Buffer.alloc(W*H*3,18);
function dot(x,y,r,c){for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){if(i*i+j*j>r*r)continue;const X=x+i|0,Y=y+j|0;if(X<0||Y<0||X>=W||Y>=H)continue;const o=(Y*W+X)*3;px[o]=c[0];px[o+1]=c[1];px[o+2]=c[2]}}
function line(x0,y0,x1,y1,c){const n=Math.ceil(Math.hypot(x1-x0,y1-y0));for(let i=0;i<=n;i++){const u=n?i/n:0;dot(x0+(x1-x0)*u,y0+(y1-y0)*u,2,c)}}
function panel(nx,ny,title){
  const pw=W/3,ph=(H-40)/2,ox=nx*pw,oy=ny*ph+40;
  for(let x=ox;x<ox+pw;x++){for(const y of [oy,oy+ph-1]){const o=((y|0)*W+(x|0))*3;px[o]=90;px[o+1]=90;px[o+2]=90}}
  return {ox,oy,pw,ph};
}
function text(s,x,y,c){ // 3x5 font for A-Z0-9():.-+/_ space
  const F={A:"010101101111",B:"110101110101110",C:"011100100100011",D:"110101101101110",E:"111100111100111",F:"111100111100100",G:"011100101101011",H:"101101111101101",I:"111010010010111",J:"001001001101010",K:"101101110101101",L:"100100100100111",M:"101111111101101",N:"110101101101101",O:"010101101101010",P:"110101110100100",Q:"010101101010001",R:"110101110101101",S:"011100010001110",T:"111010010010010",U:"101101101101011",V:"101101101101010",W:"101101111111101",X:"101101010101101",Y:"101101010010010",Z:"111001010100111","0":"010101101101010","1":"010110010010111","2":"110001010100111","3":"110001010001110","4":"101101111001001","5":"111100110001110","6":"011100110101011","7":"111001010010010","8":"010101010101010","9":"010101011001110","(":"001010010010001",")":"100010010010100",":":"000010000010000",".":"000000000000010","-":"000000111000000","+":"000010111010000","/":"001001010100100","_":"000000000000111"," ":"000000000000000"};
  let cx=x;for(const ch of s.toUpperCase()){const g=F[ch]||F[" "];for(let r=0;r<5;r++)for(let c2=0;c2<3;c2++)if(g[r*3+c2]==="1")dot(cx+c2,y+r,0,c);cx+=4}
}

// ---------- load hero + anims + source ----------
const buf=fs.readFileSync("src/assets/invincible.glb");
const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),"");
const scene=gltf.scene;scene.updateMatrixWorld(true);
const F=n=>{let r=null;scene.traverse(o=>{if(!r&&o.name===n)r=o});return r};
const A=JSON.parse(fs.readFileSync("src/assets/anims.json","utf8"));
const restHips=F("Hips_01").position.clone();
const body=new THREE.Group();body.add(scene);
function sampleGame(clip,t,pitch,gazeT){
  const c=A.clips[clip];
  const tt=c.loop?((t%c.dur)+c.dur)%c.dur:Math.min(Math.max(t,0),c.dur-1e-4);
  const f=(tt/c.dur)*(c.frames.length-1);
  const i0=Math.floor(f),i1=Math.min(c.frames.length-1,i0+1),u=f-i0;
  const F0=c.frames[i0],F1=c.frames[i1];
  const _a=new THREE.Quaternion(),_b=new THREE.Quaternion();
  A.bones.forEach((bn,bi)=>{
    _a.set(F0[bi*4],F0[bi*4+1],F0[bi*4+2],F0[bi*4+3]);
    _b.set(F1[bi*4],F1[bi*4+1],F1[bi*4+2],F1[bi*4+3]);
    if(_a.dot(_b)<0){_b.x*=-1;_b.y*=-1;_b.z*=-1;_b.w*=-1}
    F(bn).quaternion.set(_a.x+(_b.x-_a.x)*u,_a.y+(_b.y-_a.y)*u,_a.z+(_b.z-_a.z)*u,_a.w+(_b.w-_a.w)*u).normalize();
  });
  const H0=c.hips[i0],H1=c.hips[i1];
  F("Hips_01").position.set(restHips.x+H0[0]+(H1[0]-H0[0])*u,restHips.y+H0[1]+(H1[1]-H0[1])*u,restHips.z+H0[2]+(H1[2]-H0[2])*u);
  if(gazeT){_a.setFromEuler(new THREE.Euler(gazeT*0.4,0,0));F("NEck_05").quaternion.premultiply(_a);
    _a.setFromEuler(new THREE.Euler(gazeT*0.6,0,0));F("Head_06").quaternion.premultiply(_a)}
  body.rotation.x=pitch;body.updateMatrixWorld(true);
}
const P=n=>{const v=new THREE.Vector3();F(n).getWorldPosition(v);return v};
const HLINKS=[["Hips_01","spine001_02"],["spine001_02","spine002_03"],["spine002_03","Chest_04"],["Chest_04","NEck_05"],["NEck_05","Head_06"],["Chest_04","shoulderL_07"],["shoulderL_07","upper_armL_08"],["upper_armL_08","forearmL_09"],["forearmL_09","handL_010"],["Chest_04","shoulderR_026"],["shoulderR_026","upper_armR_027"],["upper_armR_027","forearmR_028"],["forearmR_028","handR_029"],["Hips_01","thighL_045"],["thighL_045","shinL_046"],["shinL_046","footL_047"],["footL_047","toeL_048"],["Hips_01","thighR_049"],["thighR_049","shinR_050"],["shinR_050","footR_051"],["footR_051","toeR_052"]];
// source
const sbuf=fs.readFileSync("/home/user/animsrc/Flying.fbx");
const sobj=new FBXLoader().parse(sbuf.buffer.slice(sbuf.byteOffset,sbuf.byteOffset+sbuf.byteLength),"");
const sclip=sobj.animations.find(a=>a.tracks.length>0&&a.duration>0.01);
const smixer=new THREE.AnimationMixer(sobj);smixer.clipAction(sclip).play();
const S=n=>{let r=null;sobj.traverse(o=>{if(!r&&(o.name===`mixamorig${n}`||o.name===`mixamorig:${n}`))r=o});return r};
const SP=n=>{const v=new THREE.Vector3();S(n).getWorldPosition(v);return v};
const SLINKS=[["Hips","Spine"],["Spine","Spine1"],["Spine1","Spine2"],["Spine2","Neck"],["Neck","Head"],["Spine2","LeftShoulder"],["LeftShoulder","LeftArm"],["LeftArm","LeftForeArm"],["LeftForeArm","LeftHand"],["Spine2","RightShoulder"],["RightShoulder","RightArm"],["RightArm","RightForeArm"],["RightForeArm","RightHand"],["Hips","LeftUpLeg"],["LeftUpLeg","LeftLeg"],["LeftLeg","LeftFoot"],["LeftFoot","LeftToeBase"],["Hips","RightUpLeg"],["RightUpLeg","RightLeg"],["RightLeg","RightFoot"],["RightFoot","RightToeBase"]];

// ---------- draw ----------
const SKIN=[240,200,150],BONE=[120,200,255],HEAD=[255,220,90],FACE=[120,255,140],TXT=[230,230,230];
const TRUNK=[235,235,235],LEFTL=[80,220,255],RIGHTL=[255,150,80];
function linkColor(a,b){
  const s=a+"|"+b;
  if(/Left/.test(s))return LEFTL;
  if(/Right/.test(s))return RIGHTL;
  if(/[a-z]L(_|\d)/.test(s))return LEFTL;
  if(/[a-z]R(_|\d)/.test(s))return RIGHTL;
  return TRUNK;
}
function drawFig(pn,links,Pt,faceQ,headN,side,fitKeys){
  const {ox,oy,pw,ph}=pn;
  const pts={};for(const [a,b] of links){for(const n of [a,b])if(!pts[n])pts[n]=Pt(n)}
  // robust fit: only on reference keys (outlier bones can't collapse the figure)
  let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;
  for(const n of fitKeys){const v=pts[n];if(!v)continue;const X=side?v.z:v.x,Y=v.y;mnx=Math.min(mnx,X);mxx=Math.max(mxx,X);mny=Math.min(mny,Y);mxy=Math.max(mxy,Y)}
  const sc=Math.min((pw-60)/Math.max(0.5,mxx-mnx),(ph-60)/Math.max(0.5,mxy-mny));
  const X=v=>ox+pw/2+((side?v.z:v.x)-(mnx+mxx)/2)*sc, Y=v=>oy+ph/2-(v.y-(mny+mxy)/2)*sc;
  for(const [a,b] of links)line(X(pts[a]),Y(pts[a]),X(pts[b]),Y(pts[b]),linkColor(a,b));
  for(const n of Object.keys(pts)){const r=n===headN?7:3;dot(X(pts[n]),Y(pts[n]),r,n===headN?HEAD:SKIN)}
  const f=new THREE.Vector3(0,0,1).applyQuaternion(faceQ);
  const hp=pts[headN];const tip=hp.clone().addScaledVector(f,90/sc);
  line(X(hp),Y(hp),X(tip),Y(tip),FACE);
}
text("STICK RENDER: YOUR FLYING.FBX VS IN-GAME  (SIDE VIEW, HEAD YELLOW, GAZE GREEN)",20,14,TXT);
// row 0: source / baked / cruise-game (side)
smixer.setTime(1.3);sobj.updateMatrixWorld(true);
{const seen=new Set();for(const [a,b] of SLINKS)for(const n of [a,b]){if(seen.has(n))continue;seen.add(n);const v=SP(n);console.log("src",n,"xyz=",v.x.toFixed(1),v.y.toFixed(1),v.z.toFixed(1))}}
const SFIT=["Hips","Head","LeftHand","RightHand","LeftFoot","RightFoot"];
const GFIT=["Hips_01","Head_06","handL_010","handR_029","footL_047","footR_051"];
let pn=panel(0,0);drawFig(pn,SLINKS,SP,S("Head").getWorldQuaternion(new THREE.Quaternion()),"Head",true,SFIT);text("1: YOUR FILE (SOURCE)",pn.ox+8,pn.oy+6,TXT);
sampleGame("flyM",1.3,0,0);
pn=panel(1,0);drawFig(pn,HLINKS,P,F("Head_06").getWorldQuaternion(new THREE.Quaternion()),"Head_06",true,GFIT);text("2: BAKED FLYM ON HERO",pn.ox+8,pn.oy+6,TXT);
sampleGame("flyM",1.3,-0.55,-0.72);
pn=panel(2,0);drawFig(pn,HLINKS,P,F("Head_06").getWorldQuaternion(new THREE.Quaternion()),"Head_06",true,GFIT);text("3: IN-GAME CRUISE (PITCH+GAZE)",pn.ox+8,pn.oy+6,TXT);
// row 1: fronts + menu
smixer.setTime(1.3);sobj.updateMatrixWorld(true);
pn=panel(0,1);drawFig(pn,SLINKS,SP,S("Head").getWorldQuaternion(new THREE.Quaternion()),"Head",false,SFIT);text("4: YOUR FILE FRONT",pn.ox+8,pn.oy+6,TXT);
sampleGame("flyM",1.3,-0.55,-0.72);
pn=panel(1,1);drawFig(pn,HLINKS,P,F("Head_06").getWorldQuaternion(new THREE.Quaternion()),"Head_06",false,GFIT);text("5: IN-GAME CRUISE FRONT",pn.ox+8,pn.oy+6,TXT);
sampleGame("flyM",1.3,-0.2,-0.72);
pn=panel(2,1);drawFig(pn,HLINKS,P,F("Head_06").getWorldQuaternion(new THREE.Quaternion()),"Head_06",true,GFIT);text("6: NEW V6.4 MENU (FLYM)",pn.ox+8,pn.oy+6,TXT);
// encode PNG
const raw=Buffer.alloc(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const s=(y*W+x)*3,d=(y*W+x)*4;raw[d]=px[s];raw[d+1]=px[s+1];raw[d+2]=px[s+2];raw[d+3]=255}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;
const crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcT[n]=c>>>0}
const crc=b=>{let c=0xffffffff;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0};
const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const o=Buffer.concat([l,Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(Buffer.concat([Buffer.from(t),d])),0);return Buffer.concat([o,c])};
const dat=Buffer.alloc(H*(W*4+1));
for(let y=0;y<H;y++){dat[y*(W*4+1)]=0;raw.copy(dat,y*(W*4+1)+1,y*W*4,(y+1)*W*4)}
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",zlib.deflateSync(dat)),chunk("IEND",Buffer.alloc(0))]);
fs.writeFileSync("/home/user/Arse-game/arse-game/scripts/stick-compare.png",png);
console.log("wrote scripts/stick-compare.png", png.length, "bytes");
