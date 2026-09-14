// ==================== Real skinned hero model (Invincible.glb) ====================
// This class is a drop-in replacement for `Rig` (see ./character.ts): it exposes the
// exact same public surface the engine already calls every frame (blendPose, playClip,
// walkPose, addFlutter, lookAt, setAura, ...), so combat/locomotion/ability code did not
// need to change. Internally, instead of building ~80 primitive meshes, it loads the
// uploaded glTF character and drives its real skeleton bones.
//
// How the retargeting works:
//   The game's whole animation system (POSES / CLIPS / walkPose / addFlutter, all in
//   character.ts) works by lerping plain Euler (x,y,z) values per joint. We keep an
//   identical set of "virtual" joints purely for that Euler math (untouched copy of the
//   original algorithms), and each frame compose the virtual pose on top of a live base:
//       bone.quaternion = fixup(virtualJointEuler) * clipBaseQuaternion(bone)
//   The base layer is the file's own embedded "metarig|IdleHover" animation, played
//   looping through an AnimationMixer (gentle hover bob + breathing), snapshotted every
//   frame. For the 4 center bones the Euler delta applies directly; for the 12 limb
//   bones it is conjugated from the procedural reference frame (chest for arms, hips for
//   legs) into the bone's parent frame: D = RC^-1 * Rp * RC. That mapping is verified
//   numerically by scripts/test-rig.mjs (stand/fly/punch/stride behaviorals, L/R
//   symmetry, loop-boundary pop, long-run stability) — re-run it if you touch this file.
//
// Gotchas this file already handles (do not "simplify" these away):
//   1. three.js GLTFLoader strips '.' from node names, so the file's "upper_arm.L_08"
//      arrives as "upper_armL_08". BONE_NAMES below uses the SANITIZED names, and
//      findBone additionally matches dot-insensitively as a fallback.
//   2. The model faces +Z natively (MODEL_FACING_FIX = 0), but its L/R sides are
//      mirrored vs the game's convention (game "L" = -X, model "L" = +X), so the limb
//      map is SWAPPED: procedural shL drives the file's *R* arm, etc. With the fixup
//      above, sided clips (jabR/crossL/...) still play on the correct side.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { JointName, Pose, Palette, ClipDef, ClipKey } from "./character";
import { POSES, CLIPS } from "./character";
// eslint-disable-next-line import/no-unresolved
import modelUrl from "../assets/invincible.glb";

const MODEL_SCALE = 1;                 // overall size multiplier
const MODEL_Y_OFFSET = 0;              // + lifts the model, - sinks it into the ground
const MODEL_FACING_FIX = 0;            // model faces +Z natively (verified: toes + goggles point +Z)

// Bone names as three.js GLTFLoader exposes them: '.' is stripped from the file's
// metarig/Rigify-style names ("upper_arm.L_08" -> "upper_armL_08").
// Limb sides are SWAPPED (see header): procedural *L drives the file's *R* bones.
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
const CLAVICLE_L = "shoulderR_026"; // procedural-L side (-X) = file's R clavicle
const CLAVICLE_R = "shoulderL_07";  // procedural-R side (+X) = file's L clavicle

/** Limb joints need the reference-frame fixup; center joints apply the delta directly. */
const LIMB_JOINTS: ReadonlySet<JointName> = new Set([
  "shL", "elL", "wrL", "shR", "elR", "wrR",
  "hipL", "kneeL", "ankL", "hipR", "kneeR", "ankR",
]);
/** Procedural-parent equivalent per limb chain (delta reference frame). */
const LIMB_REF: Record<string, JointName> = {
  shL: "chest", elL: "chest", wrL: "chest",
  shR: "chest", elR: "chest", wrR: "chest",
  hipL: "spine", kneeL: "spine", ankL: "spine",
  hipR: "spine", kneeR: "spine", ankR: "spine",
};

/** Public surface both the procedural `Rig` and this class satisfy — engine.ts talks to this. */
export interface HeroVisual {
  group: THREE.Group;
  body: THREE.Group;
  fistL: THREE.Object3D;
  fistR: THREE.Object3D;
  chestAnchor: THREE.Object3D;
  cape: THREE.Group | null;
  setPoseImmediate(pose: Pose): void;
  blendPose(pose: Pose, k: number): void;
  walkPose(phase: number, k: number): Pose;
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

export class GLTFHeroRig implements HeroVisual {
  group = new THREE.Group();
  body = new THREE.Group();
  fistL = new THREE.Object3D();
  fistR = new THREE.Object3D();
  chestAnchor = new THREE.Object3D();
  cape: THREE.Group | null = null; // this model has no cape; the field exists for API parity

  private ready = false;
  private modelRoot: THREE.Object3D | null = null;
  private bones: Partial<Record<JointName, THREE.Object3D>> = {};
  /** Per-frame base pose from the IdleHover clip (what deltas compose onto). */
  private baseQuat: Partial<Record<JointName, THREE.Quaternion>> = {};
  /** Static reference-frame fixup per limb: D = RC^-1 * Rp * RC (see header). */
  private restChain: Partial<Record<JointName, THREE.Quaternion>> = {};
  private restChainInv: Partial<Record<JointName, THREE.Quaternion>> = {};
  private clavL: THREE.Object3D | null = null;
  private clavR: THREE.Object3D | null = null;
  private clavBaseL = new THREE.Quaternion();
  private clavBaseR = new THREE.Quaternion();
  private mixer: THREE.AnimationMixer | null = null;
  private clip: THREE.AnimationClip | null = null;
  private lastT: number | null = null;
  private eyeMat: THREE.MeshStandardMaterial | null = null;
  private breath = 0;

  // virtual joints: pure Euler bookkeeping, mirrors character.ts's Rig 1:1
  private joints: Record<JointName, THREE.Object3D> = {
    spine: new THREE.Object3D(), chest: new THREE.Object3D(), neck: new THREE.Object3D(), head: new THREE.Object3D(),
    shL: new THREE.Object3D(), elL: new THREE.Object3D(), wrL: new THREE.Object3D(),
    shR: new THREE.Object3D(), elR: new THREE.Object3D(), wrR: new THREE.Object3D(),
    hipL: new THREE.Object3D(), kneeL: new THREE.Object3D(), ankL: new THREE.Object3D(),
    hipR: new THREE.Object3D(), kneeR: new THREE.Object3D(), ankR: new THREE.Object3D(),
  };

  // clip player — identical algorithm to Rig's
  private clipDef: ClipDef | null = null;
  private clipT = 0;
  private clipW = 0;
  private sample: Pose = {};

  private auraMat: THREE.MeshBasicMaterial;
  private aura: THREE.Mesh;
  private auraGeo: THREE.BufferGeometry;
  private static _tmpQuat = new THREE.Quaternion();
  private static _tmpQuat2 = new THREE.Quaternion();

  constructor(_pal: Palette, scale = 1) {
    // NOTE: this model doesn't recolor by palette (real textures, not procedural
    // materials) — the skin picker in the menu no longer changes its appearance.
    this.group.add(this.body);
    this.group.scale.setScalar(scale * MODEL_SCALE);

    this.auraMat = new THREE.MeshBasicMaterial({
      color: 0xffa33c, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    });
    this.auraGeo = new THREE.SphereGeometry(1.05, 18, 14);
    this.aura = new THREE.Mesh(this.auraGeo, this.auraMat);
    this.aura.position.y = 1.1;
    this.aura.scale.set(0.85, 1.35, 0.85);
    this.aura.visible = false;
    this.group.add(this.aura);

    // Sane defaults so getWorldPosition() never explodes before the glTF arrives.
    this.fistL.position.set(0.3, 1.1, 0.2);
    this.fistR.position.set(-0.3, 1.1, 0.2);
    this.chestAnchor.position.set(0, 1.5, 0.25);
    this.body.add(this.fistL, this.fistR, this.chestAnchor);

    new GLTFLoader().load(
      modelUrl,
      (gltf) => this.onLoaded(gltf.scene, gltf.animations),
      undefined,
      (err) => console.error("Invincible model failed to load:", err),
    );
  }

  private onLoaded(scene: THREE.Object3D, animations: THREE.AnimationClip[]): void {
    scene.rotation.y = MODEL_FACING_FIX;
    scene.position.y = MODEL_Y_OFFSET;

    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // combat poses can swing outside the bind-pose bounds
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          // This model has no "eye" material — the goggles serve as the glow target.
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
      this.baseQuat[key] = bone.quaternion.clone();
    }
    this.clavL = findBone(CLAVICLE_L);
    this.clavR = findBone(CLAVICLE_R);
    if (missing > 0) {
      console.warn(`Invincible rig: ${missing} bone(s) not found by name — animation will be partial.`);
    }

    // Base layer: the file's own idle animation, played looping. Deltas compose on
    // top of it every frame, so the hero breathes even when standing still.
    if (animations.length > 0) {
      this.clip = animations[0];
      this.mixer = new THREE.AnimationMixer(scene);
      this.mixer.clipAction(this.clip).play();
      this.mixer.update(0);
    }
    scene.updateMatrixWorld(true);
    this.snapshotBase();
    this.computeRestChains();

    // fist / chest VFX anchors now ride the real bones
    if (this.bones.wrL) { this.fistL.position.set(0, 0.05, 0.08); this.bones.wrL.add(this.fistL); }
    if (this.bones.wrR) { this.fistR.position.set(0, 0.05, 0.08); this.bones.wrR.add(this.fistR); }
    if (this.bones.chest) { this.chestAnchor.position.set(0, 0.15, 0.12); this.bones.chest.add(this.chestAnchor); }

    this.body.add(scene);
    this.modelRoot = scene;
    this.ready = true;
    this.setPoseImmediate(POSES.idle);
  }

  /** Capture the clip's current local quats — commit() composes deltas onto these. */
  private snapshotBase(): void {
    for (const key of Object.keys(this.bones) as JointName[]) {
      const bone = this.bones[key];
      if (!bone) continue;
      let q = this.baseQuat[key];
      if (!q) { q = new THREE.Quaternion(); this.baseQuat[key] = q; }
      q.copy(bone.quaternion);
    }
    if (this.clavL) this.clavBaseL.copy(this.clavL.quaternion);
    if (this.clavR) this.clavBaseR.copy(this.clavR.quaternion);
  }

  /**
   * Reference-frame fixup per limb, computed once from the rest base:
   * RC = Ref^-1 * parentRestWorld, applied as D = RC^-1 * Rp * RC.
   * (Procedural deltas are authored in chest/hips space, but e.g. the arm bones hang
   * under sideways-pointing clavicles — without this, punches would fly sideways.)
   */
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

  /* ---------------- bone commit: virtual joint Euler -> real bone quaternion ---------------- */

  private commit(): void {
    if (!this.ready) return;
    const tmp = GLTFHeroRig._tmpQuat;
    const tmp2 = GLTFHeroRig._tmpQuat2;
    for (const key of Object.keys(this.bones) as JointName[]) {
      const bone = this.bones[key];
      const base = this.baseQuat[key];
      if (!bone || !base) continue;
      tmp.setFromEuler(this.joints[key].rotation);
      const rc = this.restChain[key];
      const rcInv = this.restChainInv[key];
      if (rc && rcInv) {
        // D = RC^-1 * Rp * RC, then bone = D * base
        tmp2.copy(rcInv).multiply(tmp).multiply(rc);
        bone.quaternion.copy(base).premultiply(tmp2);
      } else {
        bone.quaternion.copy(base).premultiply(tmp);
      }
    }
    // clavicles softly follow the shoulders for a natural shrug on big raises
    if (this.clavL) {
      tmp.setFromEuler(new THREE.Euler(this.joints.shL.rotation.x * 0.3, this.joints.shL.rotation.y * 0.3, 0));
      this.clavL.quaternion.copy(this.clavBaseL).premultiply(tmp);
    }
    if (this.clavR) {
      tmp.setFromEuler(new THREE.Euler(this.joints.shR.rotation.x * 0.3, this.joints.shR.rotation.y * 0.3, 0));
      this.clavR.quaternion.copy(this.clavBaseR).premultiply(tmp);
    }
    if (this.bones.chest) {
      this.bones.chest.scale.setScalar(1 + this.breath * 0.015);
    }
  }

  /* ---------------- pose blending (identical algorithms to Rig) ---------------- */

  setPoseImmediate(pose: Pose): void {
    for (const k of Object.keys(this.joints) as JointName[]) {
      const t = pose[k];
      const j = this.joints[k];
      if (t) j.rotation.set(t[0], t[1], t[2]);
      else j.rotation.set(0, 0, 0);
    }
    this.commit();
  }

  walkPose(phase: number, k: number): Pose {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const run = k;
    const amp = 0.62 * run;
    const hipL = -s * amp;
    const hipR = s * amp;
    const kneeL = Math.max(0, -c * s) * 1.15 * run + 0.08;
    const kneeR = Math.max(0, c * s) * 1.15 * run + 0.08;
    return {
      spine: [0.14 + run * 0.22, s * 0.06 * run, 0],
      chest: [0.06 + run * 0.16, -s * 0.07 * run, 0],
      neck: [-0.1 - run * 0.14, 0, 0],
      head: [0.04, 0, 0],
      shL: [-0.42 - s * 0.52 * run, 0, 0.3],
      elL: [-0.78 - Math.max(0, s) * 0.5 * run, 0, 0.08],
      wrL: [-0.25, 0, 0],
      shR: [-0.42 + s * 0.52 * run, 0, -0.3],
      elR: [-0.78 - Math.max(0, -s) * 0.5 * run, 0, -0.08],
      wrR: [-0.25, 0, 0],
      hipL: [hipL, 0, 0.05],
      kneeL: [kneeL, 0, 0],
      ankL: [-hipL * 0.5 - 0.04, 0, 0],
      hipR: [hipR, 0, -0.05],
      kneeR: [kneeR, 0, 0],
      ankR: [-hipR * 0.5 - 0.04, 0, 0],
    };
  }

  blendPose(pose: Pose, k: number): void {
    for (const name of Object.keys(this.joints) as JointName[]) {
      const j = this.joints[name];
      const t = pose[name];
      const tx = t ? t[0] : 0, ty = t ? t[1] : 0, tz = t ? t[2] : 0;
      j.rotation.x += (tx - j.rotation.x) * k;
      j.rotation.y += (ty - j.rotation.y) * k;
      j.rotation.z += (tz - j.rotation.z) * k;
    }
    this.commit();
  }

  /* ---------------- clip player (identical algorithm to Rig) ---------------- */

  playClip(name: string, rate = 1): void {
    const def = CLIPS[name];
    if (!def) return;
    this.clipDef = { dur: def.dur / Math.max(0.2, rate), keys: def.keys };
    this.clipT = 0;
    this.clipW = 0;
  }

  clipActive(): boolean { return this.clipDef !== null; }

  updateClip(dt: number): void {
    const def = this.clipDef;
    if (!def) return;
    this.clipT += dt;
    const k = this.clipT / def.dur;
    if (k >= 1) {
      this.clipW = Math.max(0, this.clipW - dt * 9);
      if (this.clipW <= 0.01) { this.clipDef = null; this.clipW = 0; }
    } else {
      this.clipW = Math.min(1, this.clipW + dt * 26);
    }
    this.samplePose(k, def.keys);
    const w = this.clipW;
    for (const name of Object.keys(this.sample) as JointName[]) {
      const j = this.joints[name];
      if (!j) continue;
      const t = this.sample[name]!;
      j.rotation.x += (t[0] - j.rotation.x) * w;
      j.rotation.y += (t[1] - j.rotation.y) * w;
      j.rotation.z += (t[2] - j.rotation.z) * w;
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

  /* ---------------- secondary motion ---------------- */

  addFlutter(t: number, amount: number): void {
    // Advance the idle-clip base layer. addFlutter runs once per frame in every engine
    // flow (menu + playing), so the clip time is derived from the game clock. If this
    // ever stops being called, the base simply freezes — procedural poses keep working.
    if (this.lastT === null) this.lastT = t;
    const dt = Math.min(Math.max(t - this.lastT, 0), 0.1);
    this.lastT = t;
    if (this.mixer && this.ready) {
      this.mixer.update(dt);
      this.snapshotBase();
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

  /** No separate bicep meshes on the real model — kept as a harmless no-op for API parity. */
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
  }

  /** This model has no cape — kept as a harmless no-op for API parity. */
  updateCape(_dt: number, _localSpeed: number, _t: number): void {}

  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.clip) this.mixer.uncacheClip(this.clip);
      this.mixer = null;
      this.clip = null;
    }
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
