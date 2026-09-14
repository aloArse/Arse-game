// ==================== Real skinned hero model (Invincible.glb) ====================
// Drop-in replacement for `Rig` (see ./character.ts): same public surface the engine
// calls every frame (blendPose, playClip, walkPose, addFlutter, lookAt, setAura, ...).
//
// Animation architecture (baked mocap + procedural offsets):
//   LAYER 1 - baked base: one of 28 mocap clips retargeted offline to THIS skeleton
//     (scripts/bake-anims.mjs + bake-add.mjs + postbake.mjs -> src/assets/anims.json,
//     verified by scripts/test-anims.mjs + test-new.mjs). Base selection routes on
//     POSE IDENTITY (engine passes POSES.* object refs): hover/idle/stand/idleFight/
//     blast(hold)/hurt/block/loco + fly/fist/dash/spin/slamUp/slamDown/grab.
//   LAYER 2 - baked one-shot: single track with crossfade in/out (punches, kick,
//     casts, throw, clap, snatch, land, hit). Engine clip names map via ONSHOT.
//   LAYER 3 - procedural Euler offsets: the 16 virtual joints (character.ts math)
//     compose on top for flutter and lookAt only (flight/dash/spin/slam/grab are
//     real mocap since v6.2; the old POSES euler values serve the enemies' rig).
//   Unknown playClip names still fall back to the old Euler CLIPS path.
// Locomotion is phase-driven: engine advances walkT via locoRate() (stride-matched,
// footstep-synced); walkPose(phase, gSpd) selects walk/run/sprint by raw speed.
//
// Gotchas (do not "simplify" these away):
//   1. GLTFLoader strips '.' from node names ("upper_arm.L_08" -> "upper_armL_08").
//      anims.json already stores sanitized names.
//   2. The model faces +Z natively (MODEL_FACING_FIX = 0). File "L" bones sit at +X,
//      which the game calls its RIGHT side, so the virtual-joint map stays SWAPPED
//      (procedural shL drives file *R* bones). Baked clips carry true anatomy:
//      punchM/uppercutM are mirrored variants for game-R moves (see postbake).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { JointName, Pose, Palette, ClipDef, ClipKey } from "./character";
import { POSES, CLIPS } from "./character";
// eslint-disable-next-line import/no-unresolved
import modelUrl from "../assets/invincible.glb";
// eslint-disable-next-line import/no-unresolved
import animsUrl from "../assets/anims.json?url";

const MODEL_SCALE = 1;
const MODEL_Y_OFFSET = 0;
const MODEL_FACING_FIX = 0;
/** setAura morph scratch (upright egg <-> flight loaf targets) */
const _auraPos = new THREE.Vector3();
const _auraScale = new THREE.Vector3(1, 1, 1);

/** Virtual joint -> file bone. Limb sides SWAPPED (game-L = file-R, see header). */
const BONE_NAMES: Record<JointName, string> = {
  spine: "Hips_01",
  chest: "Chest_04",
  neck: "NEck_05",
  head: "Head_06",
  shL: "upper_armR_027",
  elL: "forearmR_028",
  wrL: "handR_029",
  shR: "upper_armL_08",
  elR: "forearmL_09",
  wrR: "handL_010",
  hipL: "thighR_049",
  kneeL: "shinR_050",
  ankL: "footR_051",
  hipR: "thighL_045",
  kneeR: "shinL_046",
  ankR: "footL_047",
};
const CLAVICLE_L = "shoulderR_026";
const CLAVICLE_R = "shoulderL_07";

const LIMB_JOINTS: ReadonlySet<JointName> = new Set([
  "shL", "elL", "wrL", "shR", "elR", "wrR",
  "hipL", "kneeL", "ankL", "hipR", "kneeR", "ankR",
]);
const LIMB_REF: Record<string, JointName> = {
  shL: "chest", elL: "chest", wrL: "chest",
  shR: "chest", elR: "chest", wrR: "chest",
  hipL: "spine", kneeL: "spine", ankL: "spine",
  hipR: "spine", kneeR: "spine", ankR: "spine",
};

/* ---------------- baked data ---------------- */

interface BakedClip {
  dur: number; fps: number; loop: boolean; root: string; stride: number;
  frames: number[][]; hips: number[][];
}
interface AnimsFile {
  bones: string[];
  clips: Record<string, BakedClip>;
  meta?: { postbaked: boolean; offsets: Record<string, { off: number; sym: number }> };
}

interface OneShotRoute {
  clip: string; rate: number; xIn: number; xOut: number;
  mode: "once" | "hold"; dip?: number; dipT?: number;
}
/** Engine clip name -> baked one-shot. Sides: game-R moves use *M (mirrored) clips. */
const ONSHOT: Record<string, OneShotRoute> = {
  jabR: { clip: "punchM", rate: 1, xIn: 0.08, xOut: 0.12, mode: "once" },
  crossL: { clip: "cross", rate: 1, xIn: 0.08, xOut: 0.12, mode: "once" },
  cross: { clip: "cross", rate: 1, xIn: 0.08, xOut: 0.12, mode: "once" },
  uppercutR: { clip: "uppercutM", rate: 1, xIn: 0.08, xOut: 0.12, mode: "once" },
  flurryR: { clip: "punchFlurryM", rate: 1, xIn: 0.04, xOut: 0.1, mode: "once" },
  flurryL: { clip: "hookFlurry", rate: 1, xIn: 0.04, xOut: 0.1, mode: "once" },
  kickHit: { clip: "kick", rate: 1, xIn: 0.07, xOut: 0.12, mode: "once" },
  blastFire: { clip: "cast1", rate: 1, xIn: 0.06, xOut: 0.1, mode: "once" },
  meteorCast: { clip: "cast2", rate: 1, xIn: 0.1, xOut: 0.14, mode: "once" },
  clapHit: { clip: "bash", rate: 1, xIn: 0.07, xOut: 0.12, mode: "once" },
  throwHit: { clip: "throw", rate: 1, xIn: 0.07, xOut: 0.12, mode: "once" },
  grabSnatch: { clip: "snatch", rate: 1, xIn: 0.08, xOut: 0.14, mode: "once" },
  slamLand: { clip: "land", rate: 1.5, xIn: 0.08, xOut: 0.16, mode: "once", dip: 0.28, dipT: 0.55 },
};
const HIT_ROUTE: OneShotRoute = { clip: "hit", rate: 1, xIn: 0.06, xOut: 0.15, mode: "hold" };

/** Locomotion gait by raw ground speed (stride-matched; caps engage at boundaries). */
function gaitFor(gSpd: number): string {
  return gSpd < 3.6 ? "walk" : gSpd < 8.2 ? "run" : "sprint";
}

export interface HeroVisual {
  group: THREE.Group;
  body: THREE.Group;
  fistL: THREE.Object3D;
  fistR: THREE.Object3D;
  chestAnchor: THREE.Object3D;
  /** between the eyes (vision-beam origin) — tracks the head bone */
  eyeAnchor: THREE.Object3D;
  cape: THREE.Group | null;
  setPoseImmediate(pose: Pose): void;
  blendPose(pose: Pose, k: number): void;
  walkPose(phase: number, gSpd: number): Pose;
  /** Stride-matched walkT advance rate (rad/s) for the given ground speed. */
  locoRate(spd: number): number;
  playClip(name: string, rate?: number): void;
  clipActive(): boolean;
  updateClip(dt: number): void;
  addFlutter(t: number, amount: number): void;
  lookAt(target: THREE.Vector3 | null, k: number): void;
  setFlex(v: number): void;
  setEyeGlow(color: number, intensity: number): void;
  setAura(on: boolean, color: number, strength: number): void;
  updateCape(dt: number, localSpeed: number, t: number): void;
  dispose(): void;
}

interface OneShotState {
  clip: string; t: number; rate: number; w: number;
  phase: "in" | "play" | "out"; mode: "once" | "hold";
  releasing: boolean; xIn: number; xOut: number; dip: number; dipT: number;
}

export class GLTFHeroRig implements HeroVisual {
  group = new THREE.Group();
  body = new THREE.Group();
  fistL = new THREE.Object3D();
  fistR = new THREE.Object3D();
  chestAnchor = new THREE.Object3D();
  eyeAnchor = new THREE.Object3D();
  cape: THREE.Group | null = null;

  private ready = false;
  private glbReady = false;
  private anims: AnimsFile | null = null;
  private modelRoot: THREE.Object3D | null = null;
  private bones: Partial<Record<JointName, THREE.Object3D>> = {};
  /** Baked bone objects, aligned 1:1 with anims.bones. */
  private bakedBones: THREE.Object3D[] = [];
  private restHipsPos = new THREE.Vector3();
  private restChain: Partial<Record<JointName, THREE.Quaternion>> = {};
  private restChainInv: Partial<Record<JointName, THREE.Quaternion>> = {};
  private clavL: THREE.Object3D | null = null;
  private clavR: THREE.Object3D | null = null;
  private lastT: number | null = null;
  private lastDt = 1 / 60;
  private eyeMat: THREE.MeshStandardMaterial | null = null;
  private breath = 0;

  // base player
  private baseClip = "hover";
  private baseT = 0;
  private baseHold = false;
  private prevClip: string | null = null;
  private prevT = 0;
  private prevW = 0;
  private prevXfDur = 0.12;
  private locoClip = "walk";
  private locoPhase = 0;
  private locoSpd = 0;
  private readonly locoMarker: Pose = {};
  private lastSel = "hover";
  // block overlay
  private blockW = 0;
  private blockSeen = false;
  private blockT = 0;
  // one-shot track
  private os: OneShotState | null = null;

  // virtual joints: pure Euler bookkeeping, mirrors character.ts's Rig 1:1
  private joints: Record<JointName, THREE.Object3D> = {
    spine: new THREE.Object3D(), chest: new THREE.Object3D(), neck: new THREE.Object3D(), head: new THREE.Object3D(),
    shL: new THREE.Object3D(), elL: new THREE.Object3D(), wrL: new THREE.Object3D(),
    shR: new THREE.Object3D(), elR: new THREE.Object3D(), wrR: new THREE.Object3D(),
    hipL: new THREE.Object3D(), kneeL: new THREE.Object3D(), ankL: new THREE.Object3D(),
    hipR: new THREE.Object3D(), kneeR: new THREE.Object3D(), ankR: new THREE.Object3D(),
  };

  // procedural clip fallback (unknown names) — identical algorithm to Rig's
  private clipDef: ClipDef | null = null;
  private clipT = 0;
  private clipW = 0;
  private sample: Pose = {};

  private auraMat: THREE.MeshBasicMaterial;
  private aura: THREE.Mesh;
  private auraGeo: THREE.BufferGeometry;
  // scratch (no per-frame allocation in the hot path)
  private _qa = new THREE.Quaternion();
  private _qb = new THREE.Quaternion();
  private _e = new THREE.Euler();
  private _mixQ: THREE.Quaternion[] = [];
  private _mixH = new THREE.Vector3();
  private _tmpQ: THREE.Quaternion[] = [];
  private _tmpH = new THREE.Vector3();

  constructor(_pal: Palette, scale = 1) {
    this.group.add(this.body);
    this.group.scale.setScalar(scale * MODEL_SCALE);

    this.auraMat = new THREE.MeshBasicMaterial({
      color: 0xffa33c, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    });
    this.auraGeo = new THREE.SphereGeometry(1.5, 18, 14);
    this.aura = new THREE.Mesh(this.auraGeo, this.auraMat);
    this.aura.position.set(0, 1.6, 0.1);
    this.aura.scale.set(0.95, 1.15, 0.95);
    this.aura.visible = false;
    this.group.add(this.aura);

    this.fistL.position.set(0.3, 1.1, 0.2);
    this.fistR.position.set(-0.3, 1.1, 0.2);
    this.chestAnchor.position.set(0, 1.5, 0.25);
    this.eyeAnchor.position.set(0, 2.95, 0.25);
    this.body.add(this.fistL, this.fistR, this.chestAnchor, this.eyeAnchor);

    new GLTFLoader().load(
      modelUrl,
      (gltf) => this.onLoaded(gltf.scene),
      undefined,
      (err) => console.error("Invincible model failed to load:", err),
    );
    fetch(animsUrl)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => { this.anims = j as AnimsFile; this.maybeReady(); })
      .catch((err) => console.error("Baked anims failed to load (procedural fallback):", err));
  }

  private maybeReady(): void {
    if (this.ready || !this.glbReady || !this.anims) return;
    // resolve baked bones
    this.bakedBones = this.anims.bones.map((n) => {
      let found: THREE.Object3D | null = null;
      this.modelRoot!.traverse((o) => { if (!found && o.name === n) found = o; });
      return found as unknown as THREE.Object3D;
    });
    const missing = this.bakedBones.filter((b) => !b).length;
    if (missing > 0) console.warn(`Invincible rig: ${missing} baked bone(s) missing — animation will be partial.`);
    const n = this.anims.bones.length;
    this._mixQ = Array.from({ length: n }, () => new THREE.Quaternion());
    this._tmpQ = Array.from({ length: n }, () => new THREE.Quaternion());
    this.ready = true;
    this.setPoseImmediate(POSES.hover);
  }

  private onLoaded(scene: THREE.Object3D): void {
    scene.rotation.y = MODEL_FACING_FIX;
    scene.position.y = MODEL_Y_OFFSET;

    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m && /eye|goggle/i.test(m.name || "")) this.eyeMat = m as THREE.MeshStandardMaterial;
        }
      }
    });

    const findBone = (name: string): THREE.Object3D | null => {
      const plain = name.replace(/\./g, "");
      let found: THREE.Object3D | null = null;
      scene.traverse((o) => {
        if (!found && (o.name === name || o.name.replace(/\./g, "") === plain)) found = o;
      });
      return found;
    };

    let missing = 0;
    for (const key of Object.keys(BONE_NAMES) as JointName[]) {
      const bone = findBone(BONE_NAMES[key]);
      if (!bone) { missing++; continue; }
      this.bones[key] = bone;
    }
    this.clavL = findBone(CLAVICLE_L);
    this.clavR = findBone(CLAVICLE_R);
    if (missing > 0) {
      console.warn(`Invincible rig: ${missing} joint bone(s) not found — animation will be partial.`);
    }
    const hips = findBone("Hips_01");
    if (hips) this.restHipsPos.copy(hips.position);

    scene.updateMatrixWorld(true);
    this.computeRestChains();

    if (this.bones.wrL) { this.fistL.position.set(0, 0.05, 0.08); this.bones.wrL.add(this.fistL); }
    if (this.bones.wrR) { this.fistR.position.set(0, 0.05, 0.08); this.bones.wrR.add(this.fistR); }
    if (this.bones.chest) { this.chestAnchor.position.set(0, 0.15, 0.12); this.bones.chest.add(this.chestAnchor); }
    // bone space is x1.6-scaled: (0,0.10,0.13) ~= 0.16 up / 0.21 fwd of the head joint (goggle line)
    if (this.bones.head) { this.eyeAnchor.position.set(0, 0.10, 0.13); this.bones.head.add(this.eyeAnchor); }

    this.body.add(scene);
    this.modelRoot = scene;
    this.glbReady = true;
    this.maybeReady();
  }

  /** Reference-frame fixup per limb from the BIND pose: D = RC^-1 * Rp * RC. */
  private computeRestChains(): void {
    const refQ = new THREE.Quaternion();
    const parentQ = new THREE.Quaternion();
    for (const key of LIMB_JOINTS) {
      const bone = this.bones[key];
      const ref = this.bones[LIMB_REF[key]];
      if (!bone || !ref || !bone.parent) continue;
      ref.getWorldQuaternion(refQ);
      bone.parent.getWorldQuaternion(parentQ);
      const rc = refQ.clone().invert().multiply(parentQ);
      this.restChain[key] = rc;
      this.restChainInv[key] = rc.clone().invert();
    }
  }

  /* ---------------- baked sampling ---------------- */

  /** Sample clip time t into _tmpQ/_tmpH (nlerp between frames). */
  private sampleInto(clipName: string, t: number): void {
    const A = this.anims!;
    const c = A.clips[clipName] || A.clips.hover;
    const tt = c.loop
      ? ((t % c.dur) + c.dur) % c.dur
      : Math.min(Math.max(t, 0), c.dur - 1e-4);
    const f = (tt / c.dur) * (c.frames.length - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(c.frames.length - 1, i0 + 1);
    const u = f - i0;
    const F0 = c.frames[i0], F1 = c.frames[i1];
    const Q = this._tmpQ;
    for (let bi = 0; bi < Q.length; bi++) {
      const ax = F0[bi * 4], ay = F0[bi * 4 + 1], az = F0[bi * 4 + 2], aw = F0[bi * 4 + 3];
      let bx = F1[bi * 4], by = F1[bi * 4 + 1], bz = F1[bi * 4 + 2], bw = F1[bi * 4 + 3];
      if (ax * bx + ay * by + az * bz + aw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
      Q[bi].set(ax + (bx - ax) * u, ay + (by - ay) * u, az + (bz - az) * u, aw + (bw - aw) * u).normalize();
    }
    const H0 = c.hips[i0], H1 = c.hips[i1];
    this._tmpH.set(
      H0[0] + (H1[0] - H0[0]) * u,
      H0[1] + (H1[1] - H0[1]) * u,
      H0[2] + (H1[2] - H0[2]) * u,
    );
  }

  private nlerpInto(dst: THREE.Quaternion, a: THREE.Quaternion, b: THREE.Quaternion, w: number): void {
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (a.x * bx + a.y * by + a.z * bz + a.w * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
    dst.set(a.x + (bx - a.x) * w, a.y + (by - a.y) * w, a.z + (bz - a.z) * w, a.w + (bw - a.w) * w).normalize();
  }

  private gaitTime(gait: string, phase: number): number {
    const c = this.anims!.clips[gait];
    const off = this.anims!.meta?.offsets[gait]?.off ?? 0;
    const pos = (((phase / (Math.PI * 2) + off) % 1) + 1) % 1;
    return pos * c.dur;
  }

  /* ---------------- base selection ---------------- */

  /** Crossfade duration derived from the engine's blend urgency (k ~= dt*blend). */
  private xfFromK(k: number): number {
    const rate = k / Math.max(1e-3, this.lastDt);
    return Math.min(0.25, Math.max(0.05, 1 / Math.max(1e-3, rate)));
  }

  private requestBase(name: string, hold: boolean, xf: number): void {
    if (name === this.baseClip && hold === this.baseHold && this.prevClip === null) return;
    if (name !== this.baseClip || hold !== this.baseHold) {
      this.prevClip = this.baseClip === "loco" ? this.locoClip : this.baseClip;
      this.prevT = this.baseClip === "loco" ? this.gaitTime(this.locoClip, this.locoPhase) : this.baseT;
      this.prevW = 1;
      this.prevXfDur = Math.max(0.03, xf);
      this.baseClip = name;
      this.baseHold = hold;
      const c = this.anims?.clips[name === "loco" ? this.locoClip : name];
      this.baseT = hold && c ? c.dur - 1e-3 : 0;
    }
  }

  /** Record a base selection; a hold one-shot (hurt) releases when leaving hurt. */
  private noteSel(sel: string): void {
    if (sel !== "hurt" && this.os && this.os.mode === "hold") this.os.releasing = true;
    this.lastSel = sel;
  }

  private selectLoco(): void {
    const gait = gaitFor(this.locoSpd);
    if (this.baseClip !== "loco") {
      this.locoClip = gait;
      this.requestBase("loco", false, 0.15);
    } else if (gait !== this.locoClip) {
      // gait change under the same phase: short crossfade covers the resync
      this.prevClip = this.locoClip;
      this.prevT = this.gaitTime(this.locoClip, this.locoPhase);
      this.prevW = 1;
      this.prevXfDur = 0.15;
      this.locoClip = gait;
    }
    this.noteSel("loco");
  }

  /* ---------------- HeroVisual ---------------- */

  setPoseImmediate(pose: Pose): void {
    // Baked-routed poses own the body procedurally-zeroed; only true procedural
    // poses initialize the virtual joints (else the offsets double the baked base).
    const bakedRouted = pose === POSES.hover || pose === POSES.idle || pose === POSES.stand
      || pose === POSES.idleFight || pose === POSES.blast || pose === POSES.hurt
      || pose === POSES.fly || pose === POSES.fist || pose === POSES.dash || pose === POSES.spin
      || pose === POSES.slamUp || pose === POSES.slamDown || pose === POSES.grab;
    for (const k of Object.keys(this.joints) as JointName[]) {
      const t = bakedRouted ? undefined : pose[k];
      const j = this.joints[k];
      if (t) j.rotation.set(t[0], t[1], t[2]);
      else j.rotation.set(0, 0, 0);
    }
    this.baseClip = "hover"; this.baseT = 0; this.baseHold = false;
    this.prevClip = null; this.prevW = 0;
    this.os = null; this.clipDef = null; this.clipW = 0;
    this.blockW = 0;
    this.lastSel = "hover";
    this.commit();
  }

  walkPose(phase: number, gSpd: number): Pose {
    this.locoPhase = phase;
    this.locoSpd = gSpd;
    return this.locoMarker;
  }

  locoRate(spd: number): number {
    if (!this.anims) return 5 + spd * 0.62;
    const gait = gaitFor(spd);
    const c = this.anims.clips[gait];
    const base = (Math.PI * 2) / c.dur;
    const raw = (spd / c.stride) * Math.PI * 2;
    const lo = gait === "walk" ? 0.7 : gait === "run" ? 0.8 : 0.9;
    const hi = gait === "walk" ? 2.0 : gait === "run" ? 2.0 : 2.2;
    return Math.min(base * hi, Math.max(base * lo, raw));
  }

  blendPose(pose: Pose, k: number): void {
    if (!this.ready || !this.anims) {
      // not loaded yet: keep virtual joints alive; commit stays parked
      for (const name of Object.keys(this.joints) as JointName[]) {
        const j = this.joints[name];
        const t = pose[name];
        const tx = t ? t[0] : 0, ty = t ? t[1] : 0, tz = t ? t[2] : 0;
        j.rotation.x += (tx - j.rotation.x) * k;
        j.rotation.y += (ty - j.rotation.y) * k;
        j.rotation.z += (tz - j.rotation.z) * k;
      }
      return;
    }
    if (pose === this.locoMarker) { this.selectLoco(); return; }
    if (pose === POSES.block) {
      this.blockSeen = true;
      this.blockW = Math.min(1, this.blockW + k);
      return;
    }
    const xf = this.xfFromK(k);
    if (pose === POSES.hover) { this.requestBase("hover", false, xf); this.noteSel("hover"); }
    else if (pose === POSES.idle || pose === POSES.stand) { this.requestBase("idle", false, xf); this.noteSel("idle"); }
    else if (pose === POSES.idleFight) { this.requestBase("fightIdle", false, xf); this.noteSel("fight"); }
    else if (pose === POSES.blast) { this.requestBase("cast1", true, xf); this.noteSel("blast"); }
    else if (pose === POSES.hurt) {
      const edge = this.lastSel !== "hurt";
      this.noteSel("hurt");
      if (edge) this.fireOneShot(HIT_ROUTE, 1);
      this.requestBase("neutral", false, xf);
    } else if (pose === POSES.fly || pose === POSES.slamUp || pose === POSES.slamDown) { this.requestBase("flyM", false, xf); this.noteSel("fly"); }
    else if (pose === POSES.fist || pose === POSES.dash) { this.requestBase("diveM", true, xf); this.noteSel("dive"); }
    else if (pose === POSES.spin) { this.requestBase("spinM", false, xf); this.noteSel("spin"); }
    else if (pose === POSES.grab) { this.requestBase("grabM", false, xf); this.noteSel("grab"); }
    else {
      // legacy procedural fallback (unused by the hero since v6.2 — POSES euler
      // values are kept for the enemies' procedural rig): ride the STATIC
      // neutral base so authored eulers act directly with zero mocap drift
      for (const name of Object.keys(this.joints) as JointName[]) {
        const j = this.joints[name];
        const t = pose[name];
        const tx = t ? t[0] : 0, ty = t ? t[1] : 0, tz = t ? t[2] : 0;
        j.rotation.x += (tx - j.rotation.x) * k;
        j.rotation.y += (ty - j.rotation.y) * k;
        j.rotation.z += (tz - j.rotation.z) * k;
      }
      this.requestBase("neutral", false, xf);
      this.noteSel("proc");
    }
  }

  /* ---------------- one-shot track ---------------- */

  private fireOneShot(r: OneShotRoute, rate: number): void {
    this.clipDef = null; this.clipW = 0;
    // carry the previous weight so rapid chains (flurry/combo) blend
    // directly into the next strike instead of flickering through the base
    const w0 = this.os ? Math.min(1, this.os.w) : 0;
    this.os = {
      clip: r.clip, t: 0, rate: Math.max(0.2, rate) * r.rate, w: w0,
      phase: "in", mode: r.mode, releasing: false,
      xIn: Math.max(0.02, r.xIn), xOut: Math.max(0.03, r.xOut),
      dip: r.dip ?? 0, dipT: r.dipT ?? 0.5,
    };
  }

  playClip(name: string, rate = 1): void {
    const r = ONSHOT[name];
    if (r && this.anims) { this.fireOneShot(r, rate); return; }
    // unknown name: legacy Euler clip path
    this.os = null;
    const def = CLIPS[name];
    if (!def) return;
    this.clipDef = { dur: def.dur / Math.max(0.2, rate), keys: def.keys };
    this.clipT = 0;
    this.clipW = 0;
  }

  clipActive(): boolean {
    return (this.os !== null && (this.os.w > 0.01 || this.os.phase === "in")) || this.clipDef !== null;
  }

  updateClip(dt: number): void {
    const os = this.os;
    if (os && this.anims) {
      const c = this.anims.clips[os.clip];
      os.t += dt * os.rate;
      if (os.phase === "in") {
        os.w = Math.min(1, os.w + dt / os.xIn);
        if (os.w >= 1) os.phase = "play";
      } else if (os.phase === "play") {
        if (os.releasing || (os.mode === "once" && os.t >= c.dur)) os.phase = "out";
        else if (os.mode === "hold" && os.t >= c.dur) os.t = c.dur;
      } else {
        os.w = Math.max(0, os.w - dt / os.xOut);
        if (os.w <= 0) this.os = null;
      }
    }
    // legacy Euler fallback track
    const def = this.clipDef;
    if (def) {
      this.clipT += dt;
      const kk = this.clipT / def.dur;
      if (kk >= 1) {
        this.clipW = Math.max(0, this.clipW - dt * 9);
        if (this.clipW <= 0.01) { this.clipDef = null; this.clipW = 0; }
      } else {
        this.clipW = Math.min(1, this.clipW + dt * 26);
      }
      this.samplePose(kk, def.keys);
      const w = this.clipW;
      for (const name of Object.keys(this.sample) as JointName[]) {
        const j = this.joints[name];
        if (!j) continue;
        const t = this.sample[name]!;
        j.rotation.x += (t[0] - j.rotation.x) * w;
        j.rotation.y += (t[1] - j.rotation.y) * w;
        j.rotation.z += (t[2] - j.rotation.z) * w;
      }
    }
    this.commit();
  }

  private samplePose(k: number, keys: ClipKey[]): void {
    this.sample = {};
    if (k <= keys[0].t) { this.sample = keys[0].pose; return; }
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (k >= a.t && k <= b.t) {
        let u = (k - a.t) / Math.max(1e-5, b.t - a.t);
        switch (a.ease) {
          case "in": u = u * u * u; break;
          case "out": u = 1 - Math.pow(1 - u, 3); break;
          case "lin": break;
          default: u = u * u * (3 - 2 * u); break;
        }
        const jointsSet = new Set([...Object.keys(a.pose), ...Object.keys(b.pose)] as JointName[]);
        for (const name of jointsSet) {
          const pa = a.pose[name], pb = b.pose[name];
          const x0 = pa ? pa[0] : 0, y0 = pa ? pa[1] : 0, z0 = pa ? pa[2] : 0;
          const x1 = pb ? pb[0] : 0, y1 = pb ? pb[1] : 0, z1 = pb ? pb[2] : 0;
          this.sample[name] = [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u];
        }
        return;
      }
    }
    this.sample = keys[keys.length - 1].pose;
  }

  /* ---------------- per-frame advance ---------------- */

  addFlutter(t: number, amount: number): void {
    if (this.lastT === null) this.lastT = t;
    const dt = Math.min(Math.max(t - this.lastT, 0), 0.1);
    this.lastT = t;
    this.lastDt = dt > 1e-4 ? dt : this.lastDt;
    if (this.ready && this.anims) {
      // advance base (+ previous while crossfading) and the block loop
      const A = this.anims;
      const baseName = this.baseClip === "loco" ? this.locoClip : this.baseClip;
      if (!this.baseHold && this.baseClip !== "loco") {
        const c = A.clips[baseName];
        this.baseT += dt;
        if (c.loop && this.baseT >= c.dur) this.baseT %= c.dur;
      }
      if (this.prevClip) {
        const c = A.clips[this.prevClip];
        this.prevT += dt;
        if (c && c.loop && this.prevT >= c.dur) this.prevT %= c.dur;
        this.prevW = Math.max(0, this.prevW - dt / this.prevXfDur);
        if (this.prevW <= 0) this.prevClip = null;
      }
      const bc = A.clips.block;
      this.blockT += dt;
      if (this.blockT >= bc.dur) this.blockT %= bc.dur;
      if (!this.blockSeen) this.blockW = Math.max(0, this.blockW - dt * 10);
      this.blockSeen = false;
      // stale procedural offsets decay while a baked base owns the body
      if (this.lastSel !== "proc") {
        const d = Math.exp(-8 * dt);
        for (const name of Object.keys(this.joints) as JointName[]) {
          const r = this.joints[name].rotation;
          r.x *= d; r.y *= d; r.z *= d;
        }
      }
    }
    this.breath = Math.sin(t * 1.7) * 0.5 + 0.5;
    if (amount > 0.001) {
      const a = amount;
      this.joints.hipL.rotation.x += Math.sin(t * 8.5) * 0.1 * a;
      this.joints.hipR.rotation.x -= Math.sin(t * 8.5 + 0.6) * 0.1 * a;
      this.joints.kneeL.rotation.x += Math.sin(t * 9.2 + 1) * 0.085 * a;
      this.joints.kneeR.rotation.x += Math.sin(t * 9.2) * 0.085 * a;
      this.joints.shL.rotation.z += Math.sin(t * 6.4) * 0.045 * a;
      this.joints.shR.rotation.z -= Math.sin(t * 6.4 + 0.9) * 0.045 * a;
      this.joints.wrL.rotation.x += Math.sin(t * 7.4 + 0.4) * 0.06 * a;
      this.joints.wrR.rotation.x += Math.sin(t * 7.4) * 0.06 * a;
      this.joints.chest.rotation.y += Math.sin(t * 3.1) * 0.026 * a;
      this.joints.neck.rotation.z += Math.sin(t * 2.4) * 0.022 * a;
      this.joints.head.rotation.z += Math.sin(t * 2.9 + 0.7) * 0.018 * a;
    }
    this.commit();
  }

  lookAt(target: THREE.Vector3 | null, k: number): void {
    const head = this.joints.head;
    if (!target) {
      head.rotation.y += (0 - head.rotation.y) * k;
    } else {
      const local = this.group.worldToLocal(target.clone());
      const yaw = Math.atan2(local.x, Math.max(0.2, local.z));
      const clamped = Math.max(-0.6, Math.min(0.6, yaw));
      head.rotation.y += (clamped - head.rotation.y) * k;
    }
    this.commit();
  }

  /* ---------------- commit: baked base + one-shot + Euler offsets -> bones ---------------- */

  private commit(): void {
    if (!this.ready || !this.anims) return;
    const A = this.anims;
    const N = A.bones.length;
    const mixQ = this._mixQ;

    // 1. base (+ crossfade from previous)
    if (this.baseClip === "loco") this.sampleInto(this.locoClip, this.gaitTime(this.locoClip, this.locoPhase));
    else this.sampleInto(this.baseClip, this.baseT);
    for (let i = 0; i < N; i++) mixQ[i].copy(this._tmpQ[i]);
    this._mixH.copy(this._tmpH);
    if (this.prevClip && this.prevW > 0.001) {
      this.sampleInto(this.prevClip, this.prevT);
      const w = 1 - this.prevW; // 0 at xfade start -> 1 at end
      for (let i = 0; i < N; i++) this.nlerpInto(mixQ[i], this._tmpQ[i], mixQ[i], w);
      this._mixH.lerpVectors(this._tmpH, this._mixH, w);
    }

    // 2. block overlay
    if (this.blockW > 0.01) {
      const bw = this.blockW * this.blockW * (3 - 2 * this.blockW);
      this.sampleInto("block", this.blockT);
      for (let i = 0; i < N; i++) this.nlerpInto(mixQ[i], mixQ[i], this._tmpQ[i], bw);
      this._mixH.lerp(this._tmpH, bw);
    }

    // 3. one-shot track
    const os = this.os;
    if (os && os.w > 0.001) {
      const c = A.clips[os.clip];
      this.sampleInto(os.clip, Math.min(os.t, c.dur));
      for (let i = 0; i < N; i++) this.nlerpInto(mixQ[i], mixQ[i], this._tmpQ[i], os.w);
      this._mixH.lerp(this._tmpH, os.w);
      if (os.dip > 0) {
        // slam-land impact dip: starts deep, recovers over dipT (clip seconds)
        const u = Math.min(1, os.t / os.dipT);
        this._mixH.y += -os.dip * Math.cos((u * Math.PI) / 2) * os.w;
      }
    }

    // 4. write to bones + compose procedural Euler deltas on the 16 joints
    const bb = this.bakedBones;
    for (let i = 0; i < N; i++) { if (bb[i]) bb[i].quaternion.copy(mixQ[i]); }
    const hipsBone = this.bones.spine;
    if (hipsBone) {
      hipsBone.position.set(
        this.restHipsPos.x + this._mixH.x,
        this.restHipsPos.y + this._mixH.y,
        this.restHipsPos.z + this._mixH.z,
      );
    }
    const tmp = this._qa;
    const tmp2 = this._qb;
    for (const key of Object.keys(this.bones) as JointName[]) {
      const bone = this.bones[key];
      if (!bone) continue;
      tmp.setFromEuler(this.joints[key].rotation);
      const rc = this.restChain[key];
      const rcInv = this.restChainInv[key];
      if (rc && rcInv) {
        tmp2.copy(rcInv).multiply(tmp).multiply(rc);
        bone.quaternion.premultiply(tmp2);
      } else {
        bone.quaternion.premultiply(tmp);
      }
    }
    // flight gaze: fly/dive mocap stares at the water — pitch neck+head up so the
    // hero looks where he's going (ramped with the base crossfade, no popping)
    const baseName = this.baseClip === "loco" ? this.locoClip : this.baseClip;
    const lookT = baseName === "flyM" ? -0.72 : baseName === "diveM" ? -1.5 : 0;
    if (lookT !== 0) {
      const w = this.prevClip && this.prevW > 0.001 ? 1 - this.prevW : 1;
      if (this.bones.neck) {
        tmp.setFromEuler(this._e.set(lookT * 0.4 * w, 0, 0));
        this.bones.neck.quaternion.premultiply(tmp);
      }
      if (this.bones.head) {
        tmp.setFromEuler(this._e.set(lookT * 0.6 * w, 0, 0));
        this.bones.head.quaternion.premultiply(tmp);
      }
    }
    // clavicles softly follow the shoulders for a natural shrug on big raises
    if (this.clavL) {
      tmp.setFromEuler(this._e.set(this.joints.shL.rotation.x * 0.3, this.joints.shL.rotation.y * 0.3, 0));
      this.clavL.quaternion.premultiply(tmp);
    }
    if (this.clavR) {
      tmp.setFromEuler(this._e.set(this.joints.shR.rotation.x * 0.3, this.joints.shR.rotation.y * 0.3, 0));
      this.clavR.quaternion.premultiply(tmp);
    }
    if (this.bones.chest) {
      this.bones.chest.scale.setScalar(1 + this.breath * 0.015);
    }
  }

  /* ---------------- misc ---------------- */

  /** No separate bicep meshes on the real model — harmless no-op for API parity. */
  setFlex(_v: number): void {}

  setEyeGlow(color: number, intensity: number): void {
    if (!this.eyeMat) return;
    this.eyeMat.emissive?.setHex(color);
    this.eyeMat.emissiveIntensity = intensity;
  }

  setAura(on: boolean, color: number, strength: number): void {
    this.aura.visible = on && strength > 0.001;
    this.auraMat.color.setHex(color);
    this.auraMat.opacity = strength;
    // v6.5: the shell fits the pose — horizontal loaf around the prone body in
    // flight, upright egg otherwise (the old egg stayed vertical in flight and
    // the head/fists poked out).
    const baseName = this.baseClip === "loco" ? this.locoClip : this.baseClip;
    const fly = baseName === "flyM" || baseName === "diveM";
    _auraPos.set(fly ? 0 : 0, fly ? 1.8 : 1.6, fly ? -0.05 : 0.1);
    _auraScale.set(fly ? 0.8 : 0.95, fly ? 0.62 : 1.15, fly ? 1.3 : 0.95);
    this.aura.position.lerp(_auraPos, 0.2);
    this.aura.scale.lerp(_auraScale, 0.2);
  }

  /** This model has no cape — harmless no-op for API parity. */
  updateCape(_dt: number, _localSpeed: number, _t: number): void {}

  dispose(): void {
    if (this.modelRoot) {
      this.modelRoot.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            if (!m) continue;
            for (const key of Object.keys(m) as (keyof THREE.Material)[]) {
              const val = (m as unknown as Record<string, unknown>)[key as string];
              if (val && (val as { isTexture?: boolean }).isTexture) (val as THREE.Texture).dispose();
            }
            m.dispose();
          }
        }
      });
    }
    this.auraGeo.dispose();
    this.auraMat.dispose();
  }
}
