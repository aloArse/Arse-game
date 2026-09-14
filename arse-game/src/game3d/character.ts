// ---------- Detailed articulated 3D superhero rig (fully procedural) ----------
// Convention: character faces +Z. Limb pivots hang along -Y.
// joint.rotation.x negative => limb swings FORWARD (+Z); -PI => straight overhead.
import * as THREE from "three";

export type JointName =
  | "spine" | "chest" | "neck" | "head"
  | "shL" | "elL" | "wrL" | "shR" | "elR" | "wrR"
  | "hipL" | "kneeL" | "ankL" | "hipR" | "kneeR" | "ankR";

export type Pose = Partial<Record<JointName, [number, number, number]>>;

export interface Palette {
  suit: number;
  suitDark: number;
  accent: number;
  accentDark: number;
  skin: number;
  eye: number;
  hair?: number;
  cape?: number;
  capeInner?: number;
  mustache?: boolean;
  masked?: boolean;
  emblem?: "invincible" | "viltrum" | "none";
  helmet?: boolean;        // armored space-helmet look
  visorGlow?: number;      // emissive visor strip colour
  shoulders?: boolean;     // heavy pauldrons
}

export const HERO_PAL: Palette = {
  suit: 0x2a5fe0, suitDark: 0x14307e, accent: 0xffd23f, accentDark: 0xc9991c,
  skin: 0xf3b389, eye: 0xffffff, masked: true, emblem: "invincible",
};

// ================= hero skins =================
export interface SkinDef {
  id: string;
  name: string;
  desc: string;
  pal: Palette;
}

export const SKINS: SkinDef[] = [
  {
    id: "classic", name: "کلاسیک", desc: "لباس آبی و زرد امضا",
    pal: { suit: 0x2a5fe0, suitDark: 0x14307e, accent: 0xffd23f, accentDark: 0xc9991c,
      skin: 0xf3b389, eye: 0xffffff, masked: true, emblem: "invincible" },
  },
  {
    id: "omni", name: "اومنی‌من", desc: "سفید و طلایی با شنل",
    pal: { suit: 0xe8ecf4, suitDark: 0x9aa3b8, accent: 0xf2c14e, accentDark: 0xb8860b,
      skin: 0xf3b389, eye: 0xffe27a, masked: false, emblem: "viltrum",
      hair: 0xf8f8fc, cape: 0x2a5fe0, capeInner: 0x14307e, mustache: true },
  },
  {
    id: "midnight", name: "نیمه‌شب", desc: "زرهٔ تاریک با نقاب نئونی",
    pal: { suit: 0x14161f, suitDark: 0x0a0b12, accent: 0x2ee6ff, accentDark: 0x0f7f96,
      skin: 0xd8a87e, eye: 0x2ee6ff, masked: true, emblem: "none",
      helmet: true, visorGlow: 0x2ee6ff, shoulders: true },
  },
  {
    id: "solar", name: "خورشیدی", desc: "انرژی خورشید در رگ‌ها",
    pal: { suit: 0xff7a1a, suitDark: 0xa83f05, accent: 0xffe9a0, accentDark: 0xd8a03c,
      skin: 0xf3b389, eye: 0xffd23f, masked: true, emblem: "invincible",
      visorGlow: 0xffc23f },
  },
  {
    id: "viltrum", name: "ویلترامی", desc: "جنگ‌سالار قرمز و خاکستری",
    pal: { suit: 0x8f95a3, suitDark: 0x565b68, accent: 0xd32436, accentDark: 0x8e121f,
      skin: 0xe8ab80, eye: 0xffe27a, masked: false, emblem: "viltrum",
      hair: 0x2b2b33, cape: 0xd32436, capeInner: 0x6d0d18, shoulders: true },
  },
  {
    id: "nova", name: "نووا", desc: "کوانتوم بنفش درخشان",
    pal: { suit: 0x6a2fd8, suitDark: 0x3a1678, accent: 0xff4fd8, accentDark: 0xb02a94,
      skin: 0xc9a0e0, eye: 0xff9fff, masked: true, emblem: "none",
      visorGlow: 0xff4fd8, shoulders: true },
  },
];

export function skinById(id: string): SkinDef {
  return SKINS.find((sk) => sk.id === id) ?? SKINS[0];
}

export const BOSS_PAL: Palette = {
  suit: 0xf4f5fa, suitDark: 0xc0c5d6, accent: 0xd32436, accentDark: 0x8e121f,
  skin: 0xe8ab80, eye: 0xffe27a,
  hair: 0xf8f8fc, cape: 0xc01a2c, capeInner: 0x6d0d18,
  mustache: true, masked: false, emblem: "viltrum",
};

/* ---------------- procedural suit fabric ---------------- */

/** fine fabric weave + seam lines, drawn once and reused (tinted by material colour) */
function suitTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d9d9d9";
  g.fillRect(0, 0, 256, 256);
  // woven micro-thread
  for (let y = 0; y < 256; y += 2) {
    g.fillStyle = y % 4 === 0 ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)";
    g.fillRect(0, y, 256, 1);
  }
  for (let x = 0; x < 256; x += 3) {
    g.fillStyle = "rgba(0,0,0,0.05)";
    g.fillRect(x, 0, 1, 256);
  }
  // padded quilting diamonds (subtle)
  g.strokeStyle = "rgba(0,0,0,0.10)";
  g.lineWidth = 1;
  for (let i = -256; i < 512; i += 34) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke();
    g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke();
  }
  // panel seams
  g.strokeStyle = "rgba(0,0,0,0.22)";
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let SUIT_TEX: THREE.CanvasTexture | null = null;
function suitTex(): THREE.CanvasTexture {
  if (!SUIT_TEX) SUIT_TEX = suitTexture();
  return SUIT_TEX;
}

/* ---------------- pose library ---------------- */

export const POSES: Record<string, Pose> = {
  stand: {
    spine: [0.1, 0, 0], chest: [0.07, 0, 0], neck: [-0.04, 0, 0], head: [0, 0, 0],
    shL: [-0.5, 0, 0.34], elL: [-0.72, 0, 0.1], wrL: [-0.2, 0, 0],
    shR: [-0.5, 0, -0.34], elR: [-0.72, 0, -0.1], wrR: [-0.2, 0, 0],
    hipL: [-0.06, 0, 0.06], kneeL: [0.12, 0, 0], ankL: [-0.06, 0, 0],
    hipR: [-0.06, 0, -0.06], kneeR: [0.12, 0, 0], ankR: [-0.06, 0, 0],
  },
  idle: {
    spine: [0.03, 0, 0], chest: [0.02, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    shL: [-0.1, 0, 0.19], elL: [-0.26, 0, 0.04], wrL: [-0.1, 0, 0],
    shR: [-0.1, 0, -0.19], elR: [-0.26, 0, -0.04], wrR: [-0.1, 0, 0],
    hipL: [0.05, 0, 0.07], kneeL: [0.14, 0, 0], ankL: [-0.08, 0, 0],
    hipR: [0.05, 0, -0.07], kneeR: [0.14, 0, 0], ankR: [-0.08, 0, 0],
  },
  idleFight: {
    spine: [0.06, -0.12, 0], chest: [0.04, -0.1, 0], neck: [-0.04, 0.08, 0], head: [-0.05, 0.06, 0],
    shL: [-0.62, 0.22, 0.36], elL: [-1.52, 0, 0.1], wrL: [-0.34, 0, 0],
    shR: [-0.62, -0.22, -0.36], elR: [-1.52, 0, -0.1], wrR: [-0.34, 0, 0],
    hipL: [0.1, 0, 0.1], kneeL: [0.3, 0, 0], ankL: [-0.16, 0, 0],
    hipR: [0.06, 0, -0.1], kneeR: [0.24, 0, 0], ankR: [-0.12, 0, 0],
  },
  hover: {
    spine: [-0.07, 0, 0], chest: [0.05, 0, 0], neck: [0.03, 0, 0], head: [0.05, 0, 0],
    shL: [-0.36, 0.12, 0.34], elL: [-0.66, 0, 0.12], wrL: [-0.2, 0, 0],
    shR: [-0.36, -0.12, -0.34], elR: [-0.66, 0, -0.12], wrR: [-0.2, 0, 0],
    hipL: [0.32, 0, 0.11], kneeL: [0.6, 0, 0], ankL: [-0.3, 0, 0],
    hipR: [0.19, 0, -0.11], kneeR: [0.38, 0, 0], ankR: [-0.2, 0, 0],
  },
  fly: {
    spine: [0.05, 0, 0], chest: [-0.02, 0, 0], neck: [-0.16, 0, 0], head: [-0.2, 0, 0],
    shL: [0, 0, -1.5], elL: [0, 0, 0], wrL: [0, 0, 0],
    shR: [0, 0, 1.5], elR: [0, 0, 0], wrR: [0, 0, 0],
    hipL: [0.13, 0, 0.05], kneeL: [0.1, 0, 0], ankL: [-0.14, 0, 0],
    hipR: [0.09, 0, -0.05], kneeR: [0.14, 0, 0], ankR: [-0.14, 0, 0],
  },
  fist: {
    spine: [0.06, 0, 0], chest: [-0.02, 0, 0], neck: [-0.16, 0, 0], head: [-0.2, 0, 0],
    shL: [1.0, 0, 1.4], elL: [0, 0, 0], wrL: [0, 0, 0],
    shR: [0.3, 0, 1.4], elR: [0, 0, 0], wrR: [0, 0, 0],
    hipL: [0.12, 0, 0.05], kneeL: [0.14, 0, 0], ankL: [-0.15, 0, 0],
    hipR: [0.12, 0, -0.05], kneeR: [0.14, 0, 0], ankR: [-0.15, 0, 0],
  },
  dash: {
    spine: [0.05, 0, 0], chest: [0, 0, 0], neck: [-0.14, 0, 0], head: [-0.18, 0, 0],
    shL: [0.25, 0, 1.62], elL: [0, 0, 0], wrL: [0, 0, 0],
    shR: [0.25, 0, -1.62], elR: [0, 0, 0], wrR: [0, 0, 0],
    hipL: [0.05, 0, 0.12], kneeL: [0.07, 0, 0], ankL: [-0.1, 0, 0],
    hipR: [0.05, 0, -0.12], kneeR: [0.07, 0, 0], ankR: [-0.1, 0, 0],
  },
  // --- strike chain (clip-driven; these are the extension snapshots) ---
  punch: {
    spine: [-0.08, -0.38, 0], chest: [0.02, -0.24, 0], neck: [0, 0.16, 0], head: [-0.05, 0.22, 0],
    shL: [1.0, 0.22, 0.2], elL: [-1.16, 0, 0], wrL: [-0.3, 0, 0],
    shR: [-1.66, -0.1, -0.08], elR: [-0.05, 0, 0], wrR: [-0.1, 0, 0],
    hipL: [-0.36, 0, 0.12], kneeL: [0.52, 0, 0], ankL: [-0.3, 0, 0],
    hipR: [0.46, 0, -0.12], kneeR: [0.3, 0, 0], ankR: [-0.2, 0, 0],
  },
  punchAlt: {
    spine: [-0.08, 0.38, 0], chest: [0.02, 0.24, 0], neck: [0, -0.16, 0], head: [-0.05, -0.22, 0],
    shL: [-1.66, 0.1, 0.08], elL: [-0.05, 0, 0], wrL: [-0.1, 0, 0],
    shR: [1.0, -0.22, -0.2], elR: [-1.16, 0, 0], wrR: [-0.3, 0, 0],
    hipL: [0.46, 0, 0.12], kneeL: [0.3, 0, 0], ankL: [-0.2, 0, 0],
    hipR: [-0.36, 0, -0.12], kneeR: [0.52, 0, 0], ankR: [-0.3, 0, 0],
  },
  uppercut: {
    spine: [-0.34, -0.16, 0], chest: [-0.2, -0.1, 0], neck: [-0.2, 0.08, 0], head: [-0.3, 0.1, 0],
    shL: [-2.5, 0.3, 0.2], elL: [-0.5, 0, 0], wrL: [-0.4, 0, 0],
    shR: [0.7, -0.2, -0.3], elR: [-0.9, 0, 0], wrR: [-0.3, 0, 0],
    hipL: [-0.2, 0, 0.14], kneeL: [0.4, 0, 0], ankL: [-0.3, 0, 0],
    hipR: [0.3, 0, -0.14], kneeR: [0.9, 0, 0], ankR: [-0.5, 0, 0],
  },
  // --- special abilities ---
  clap: {
    spine: [-0.12, 0, 0], chest: [0.06, 0, 0], neck: [-0.06, 0, 0], head: [-0.08, 0, 0],
    shL: [-1.5, 0.72, 0.1], elL: [-0.34, 0, 0], wrL: [-0.2, 0, 0],
    shR: [-1.5, -0.72, -0.1], elR: [-0.34, 0, 0], wrR: [-0.2, 0, 0],
    hipL: [0.3, 0, 0.12], kneeL: [0.44, 0, 0], ankL: [-0.3, 0, 0],
    hipR: [0.3, 0, -0.12], kneeR: [0.44, 0, 0], ankR: [-0.3, 0, 0],
  },
  clapWind: {
    spine: [0.12, 0, 0], chest: [-0.06, 0, 0], neck: [0.04, 0, 0], head: [0.06, 0, 0],
    shL: [-1.2, -0.95, 0.9], elL: [-0.9, 0, 0], wrL: [-0.5, 0, 0],
    shR: [-1.2, 0.95, -0.9], elR: [-0.9, 0, 0], wrR: [-0.5, 0, 0],
    hipL: [0.26, 0, 0.12], kneeL: [0.42, 0, 0], ankL: [-0.3, 0, 0],
    hipR: [0.26, 0, -0.12], kneeR: [0.42, 0, 0], ankR: [-0.3, 0, 0],
  },
  grab: {
    spine: [-0.06, 0, 0], chest: [0.04, 0, 0], neck: [-0.05, 0, 0], head: [-0.08, 0, 0],
    shL: [0, 1.5, 0.1], elL: [0, -0.25, 0], wrL: [0, 0, 0],
    shR: [0, -1.5, -0.1], elR: [0, 0.25, 0], wrR: [0, 0, 0],
    hipL: [0.26, 0, 0.12], kneeL: [0.44, 0, 0], ankL: [-0.3, 0, 0],
    hipR: [0.26, 0, -0.12], kneeR: [0.44, 0, 0], ankR: [-0.3, 0, 0],
  },
  throw: {
    spine: [0.3, -0.22, 0], chest: [0.16, -0.14, 0], neck: [0.12, 0.1, 0], head: [0.16, 0.12, 0],
    shL: [-1.1, 0.2, 0.24], elL: [-0.2, 0, 0], wrL: [-0.3, 0, 0],
    shR: [-1.1, -0.2, -0.24], elR: [-0.2, 0, 0], wrR: [-0.3, 0, 0],
    hipL: [0.2, 0, 0.12], kneeL: [0.5, 0, 0], ankL: [-0.3, 0, 0],
    hipR: [0.2, 0, -0.12], kneeR: [0.5, 0, 0], ankR: [-0.3, 0, 0],
  },
  blast: {
    spine: [-0.13, 0, 0], chest: [0.09, 0, 0], neck: [-0.06, 0, 0], head: [-0.08, 0, 0],
    shL: [-1.46, 0.22, 0.24], elL: [-0.18, 0, 0], wrL: [-0.4, 0, 0],
    shR: [-1.46, -0.22, -0.24], elR: [-0.18, 0, 0], wrR: [-0.4, 0, 0],
    hipL: [0.29, 0, 0.13], kneeL: [0.44, 0, 0], ankL: [-0.3, 0, 0],
    hipR: [0.21, 0, -0.13], kneeR: [0.32, 0, 0], ankR: [-0.2, 0, 0],
  },
  slamUp: {
    spine: [-0.36, 0, 0], chest: [-0.18, 0, 0], neck: [-0.06, 0, 0], head: [-0.08, 0, 0],
    shL: [0, 0, -1.5], elL: [0, 0, 0], wrL: [0, 0, 0],
    shR: [0, 0, 1.5], elR: [0, 0, 0], wrR: [0, 0, 0],
    hipL: [0.52, 0, 0.17], kneeL: [0.95, 0, 0], ankL: [-0.5, 0, 0],
    hipR: [0.52, 0, -0.17], kneeR: [0.95, 0, 0], ankR: [-0.5, 0, 0],
  },
  slamDown: {
    spine: [0.35, 0, 0], chest: [0.15, 0, 0], neck: [0.08, 0, 0], head: [0.12, 0, 0],
    shL: [0, 0, 1.2], elL: [0, 0, 0], wrL: [0, 0, 0],
    shR: [0, 0, -1.2], elR: [0, 0, 0], wrR: [0, 0, 0],
    hipL: [0.3, 0, 0.1], kneeL: [0.32, 0, 0], ankL: [-0.35, 0, 0],
    hipR: [0.3, 0, -0.1], kneeR: [0.32, 0, 0], ankR: [-0.35, 0, 0],
  },
  spin: {
    spine: [0.02, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0.04, 0, 0],
    shL: [0, 0, 0.15], elL: [0, 0, 0], wrL: [0, 0, 0],
    shR: [0, 0, -0.15], elR: [0, 0, 0], wrR: [0, 0, 0],
    hipL: [0.23, 0, 0.12], kneeL: [0.55, 0, 0], ankL: [-0.4, 0, 0],
    hipR: [0.23, 0, -0.12], kneeR: [0.55, 0, 0], ankR: [-0.4, 0, 0],
  },
  block: {
    spine: [0.14, 0, 0], chest: [0.08, 0, 0], neck: [0.1, 0, 0], head: [0.14, 0, 0],
    shL: [-1.86, 0.44, 0.52], elL: [-1.9, 0, 0], wrL: [-0.5, 0, 0],
    shR: [-1.86, -0.44, -0.52], elR: [-1.9, 0, 0], wrR: [-0.5, 0, 0],
    hipL: [0.3, 0, 0.14], kneeL: [0.62, 0, 0], ankL: [-0.4, 0, 0],
    hipR: [0.34, 0, -0.14], kneeR: [0.66, 0, 0], ankR: [-0.4, 0, 0],
  },
  hurt: {
    spine: [-0.32, 0.14, 0], chest: [-0.16, 0, 0], neck: [-0.22, 0, 0], head: [-0.34, 0, 0],
    shL: [-0.95, 0.55, 0.75], elL: [-1.25, 0, 0], wrL: [-0.4, 0, 0],
    shR: [-0.95, -0.55, -0.75], elR: [-1.25, 0, 0], wrR: [-0.4, 0, 0],
    hipL: [-0.3, 0, 0.25], kneeL: [0.82, 0, 0], ankL: [-0.4, 0, 0],
    hipR: [-0.2, 0, -0.25], kneeR: [0.72, 0, 0], ankR: [-0.4, 0, 0],
  },
};

/* ---------------- keyframed action clips ---------------- */

export interface ClipKey { t: number; pose: Pose; ease?: "in" | "out" | "io" | "lin"; }
export interface ClipDef { dur: number; keys: ClipKey[]; }

const guard: Pose = {
  // neutral fighting guard the punches launch from and return to
  spine: [0.06, -0.1, 0], chest: [0.03, -0.08, 0], neck: [-0.04, 0.06, 0], head: [-0.05, 0.05, 0],
  shL: [-0.7, 0.24, 0.38], elL: [-1.7, 0, 0.12], wrL: [-0.3, 0, 0],
  shR: [-0.7, -0.24, -0.38], elR: [-1.7, 0, -0.12], wrR: [-0.3, 0, 0],
  hipL: [0.12, 0, 0.1], kneeL: [0.34, 0, 0], ankL: [-0.2, 0, 0],
  hipR: [0.08, 0, -0.1], kneeR: [0.26, 0, 0], ankR: [-0.16, 0, 0],
};

/** right jab: coil → snap → settle */
const jabR: Pose = {
  ...POSES.punch,
  shR: [-1.72, -0.12, -0.08], elR: [-0.06, 0, 0], wrR: [-0.12, 0, 0],
  shL: [0.9, 0.26, 0.26], elL: [-1.5, 0, 0.1],
  spine: [-0.1, -0.42, 0], chest: [0.02, -0.28, 0], head: [-0.06, 0.24, 0],
};
const jabWindR: Pose = {
  spine: [0.08, 0.14, 0], chest: [0.04, 0.1, 0], head: [-0.04, -0.05, 0],
  shR: [-0.55, -0.3, -0.42], elR: [-2.1, 0, -0.1],
  shL: [-0.75, 0.26, 0.4], elL: [-1.75, 0, 0.12],
  hipL: [0.1, 0, 0.1], kneeL: [0.32, 0, 0], hipR: [0.14, 0, -0.1], kneeR: [0.3, 0, 0],
};
const crossL: Pose = {
  ...POSES.punchAlt,
  shL: [-1.78, 0.14, 0.1], elL: [-0.06, 0, 0], wrL: [-0.12, 0, 0],
  shR: [0.85, -0.3, -0.3], elR: [-1.55, 0, -0.1],
  spine: [-0.1, 0.46, 0], chest: [0.02, 0.3, 0], head: [-0.06, -0.26, 0],
};
const crossWindL: Pose = {
  spine: [0.08, -0.16, 0], chest: [0.04, -0.12, 0], head: [-0.04, 0.08, 0],
  shL: [-0.6, 0.32, 0.44], elL: [-2.1, 0, 0.12],
  shR: [-0.8, -0.26, -0.4], elR: [-1.7, 0, -0.1],
  hipL: [0.14, 0, 0.1], kneeL: [0.3, 0, 0], hipR: [0.1, 0, -0.1], kneeR: [0.32, 0, 0],
};
const upperWindR: Pose = {
  spine: [0.22, -0.05, 0], chest: [0.12, -0.04, 0], head: [0.1, 0.02, 0],
  shR: [0.5, -0.16, -0.2], elR: [-2.3, 0, -0.08],
  shL: [-0.7, 0.3, 0.42], elL: [-1.6, 0, 0.12],
  hipR: [0.05, 0, -0.12], kneeR: [0.75, 0, 0], hipL: [0.2, 0, 0.12], kneeL: [0.2, 0, 0],
};

export const CLIPS: Record<string, ClipDef> = {
  jabR: {
    dur: 0.34,
    keys: [
      { t: 0, pose: guard, ease: "io" },
      { t: 0.34, pose: jabWindR, ease: "in" },
      { t: 0.52, pose: jabR, ease: "out" },
      { t: 1, pose: guard },
    ],
  },
  crossL: {
    dur: 0.36,
    keys: [
      { t: 0, pose: guard, ease: "io" },
      { t: 0.36, pose: crossWindL, ease: "in" },
      { t: 0.55, pose: crossL, ease: "out" },
      { t: 1, pose: guard },
    ],
  },
  uppercutR: {
    dur: 0.5,
    keys: [
      { t: 0, pose: guard, ease: "io" },
      { t: 0.42, pose: upperWindR, ease: "in" },
      { t: 0.62, pose: POSES.uppercut, ease: "out" },
      { t: 1, pose: guard },
    ],
  },
  flurryR: {
    dur: 0.15,
    keys: [
      { t: 0, pose: guard, ease: "lin" },
      { t: 0.45, pose: jabR, ease: "io" },
      { t: 1, pose: guard },
    ],
  },
  flurryL: {
    dur: 0.15,
    keys: [
      { t: 0, pose: guard, ease: "lin" },
      { t: 0.45, pose: crossL, ease: "io" },
      { t: 1, pose: guard },
    ],
  },
  clapHit: {
    dur: 0.46,
    keys: [
      { t: 0, pose: POSES.hover, ease: "io" },
      { t: 0.4, pose: POSES.clapWind, ease: "in" },
      { t: 0.56, pose: POSES.clap, ease: "out" },
      { t: 1, pose: POSES.hover },
    ],
  },
  throwHit: {
    dur: 0.34,
    keys: [
      { t: 0, pose: POSES.grab, ease: "io" },
      { t: 0.35, pose: { ...POSES.grab, spine: [-0.1, 0, 0], shL: [-1.9, 0.5, 0.3], shR: [-1.9, -0.5, -0.3] }, ease: "in" },
      { t: 0.55, pose: POSES.throw, ease: "out" },
      { t: 1, pose: POSES.hover },
    ],
  },
  blastFire: {
    dur: 0.22,
    keys: [
      { t: 0, pose: POSES.hover, ease: "io" },
      { t: 0.4, pose: { ...POSES.blast, shL: [-1.1, 0.3, 0.34], shR: [-1.1, -0.3, -0.34], elL: [-0.8, 0, 0], elR: [-0.8, 0, 0] }, ease: "in" },
      { t: 0.6, pose: POSES.blast, ease: "out" },
      { t: 1, pose: POSES.hover },
    ],
  },
  slamLand: {
    dur: 0.55,
    keys: [
      { t: 0, pose: POSES.slamDown, ease: "out" },
      { t: 0.4, pose: { ...POSES.slamDown, spine: [0.66, 0, 0], hipL: [0.85, 0, 0.24], kneeL: [1.25, 0, 0], hipR: [0.85, 0, -0.24], kneeR: [1.25, 0, 0], shL: [-0.2, 0.3, 0.5], shR: [-0.2, -0.3, -0.5], elL: [-0.9, 0, 0], elR: [-0.9, 0, 0] }, ease: "io" },
      { t: 1, pose: POSES.hover },
    ],
  },
  grabSnatch: {
    dur: 0.3,
    keys: [
      { t: 0, pose: POSES.hover, ease: "io" },
      { t: 0.5, pose: { ...POSES.grab, shL: [-1.35, 0.2, 0.3], elL: [-0.6, 0, 0], shR: [-1.35, -0.2, -0.3], elR: [-0.6, 0, 0] }, ease: "in" },
      { t: 1, pose: POSES.grab },
    ],
  },
};

/* ---------------- geometry helpers ---------------- */

function torsoGeometry(): THREE.BufferGeometry {
  // V-taper profile revolved, then flattened front-to-back
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.001, -0.05),
    new THREE.Vector2(0.175, -0.045),
    new THREE.Vector2(0.205, 0.02),
    new THREE.Vector2(0.204, 0.10),
    new THREE.Vector2(0.193, 0.19),
    new THREE.Vector2(0.194, 0.28),
    new THREE.Vector2(0.213, 0.37),
    new THREE.Vector2(0.243, 0.455),
    new THREE.Vector2(0.259, 0.525),
    new THREE.Vector2(0.249, 0.585),
    new THREE.Vector2(0.206, 0.639),
    new THREE.Vector2(0.135, 0.678),
    new THREE.Vector2(0.082, 0.7),
    new THREE.Vector2(0.001, 0.706),
  ];
  const g = new THREE.LatheGeometry(pts, 28);
  g.scale(1, 1, 0.79);
  g.computeVertexNormals();
  return g;
}

function pelvisGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.001, -0.2),
    new THREE.Vector2(0.11, -0.19),
    new THREE.Vector2(0.168, -0.13),
    new THREE.Vector2(0.196, -0.05),
    new THREE.Vector2(0.203, 0.02),
    new THREE.Vector2(0.001, 0.04),
  ];
  const g = new THREE.LatheGeometry(pts, 24);
  g.scale(1, 1, 0.8);
  g.computeVertexNormals();
  return g;
}

/* ---------------- rig ---------------- */

export class Rig {
  group = new THREE.Group();
  body = new THREE.Group();
  joints = {} as Record<JointName, THREE.Group>;
  fistL = new THREE.Object3D();
  fistR = new THREE.Object3D();
  chestAnchor = new THREE.Object3D();
  cape: THREE.Group | null = null;

  private capeSegs: THREE.Group[] = [];
  private capeAng: number[] = [];
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private eyeMat!: THREE.MeshStandardMaterial;
  private auraMat: THREE.MeshBasicMaterial | null = null;
  private aura: THREE.Mesh | null = null;
  private bicepL!: THREE.Mesh;
  private bicepR!: THREE.Mesh;
  private pecL!: THREE.Mesh;
  private pecR!: THREE.Mesh;
  private chestMesh!: THREE.Mesh;
  private flex = 0;
  private breath = 0;

  // clip player
  private clipDef: ClipDef | null = null;
  private clipT = 0;
  private clipW = 0;

  private sample: Pose = {};

  constructor(pal: Palette, scale = 1) {
    const mk = (color: number, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => {
      const m = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.46, metalness: 0.08,
        clearcoat: 0.55, clearcoatRoughness: 0.38, ...o,
      });
      this.mats.push(m);
      return m;
    };
    const keep = <T extends THREE.BufferGeometry>(g: T): T => { this.geos.push(g); return g; };

    // suit fabric gets the woven texture so panels read under light
    const suit = mk(pal.suit, {
      map: suitTex(),
      roughness: 0.52, sheen: 0.5,
      sheenColor: new THREE.Color(pal.suit).multiplyScalar(1.6),
    });
    const suitDark = mk(pal.suitDark, { roughness: 0.55, clearcoat: 0.3 });
    const accent = mk(pal.accent, { roughness: 0.3, metalness: 0.3, clearcoat: 0.8 });
    const accentDark = mk(pal.accentDark, { roughness: 0.42, metalness: 0.25 });
    const skin = mk(pal.skin, { roughness: 0.72, metalness: 0.0, clearcoat: 0.15 });

    this.eyeMat = new THREE.MeshStandardMaterial({
      color: pal.eye, emissive: new THREE.Color(pal.eye),
      emissiveIntensity: 1.4, roughness: 0.18, metalness: 0.1,
    });
    this.mats.push(this.eyeMat);

    const capsule = (r: number, len: number, caps = 5, seg = 12) =>
      keep(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), caps, seg));
    const sphere = (r: number, w = 14, h = 10) => keep(new THREE.SphereGeometry(r, w, h));

    this.group.add(this.body);

    // ================= torso =================
    const spine = new THREE.Group();
    this.joints.spine = spine;
    this.body.add(spine);

    const pelvis = new THREE.Mesh(keep(pelvisGeometry()), suitDark);
    spine.add(pelvis);

    const chest = new THREE.Group();
    chest.position.y = 0.06;
    this.joints.chest = chest;
    spine.add(chest);

    this.chestMesh = new THREE.Mesh(keep(torsoGeometry()), suit);
    chest.add(this.chestMesh);
    chest.add(this.chestAnchor);
    this.chestAnchor.position.set(0, 0.45, 0.24);

    // pectorals
    for (const sx of [-1, 1]) {
      const pec = new THREE.Mesh(sphere(0.105), suit);
      pec.position.set(sx * 0.088, 0.5, 0.125);
      pec.scale.set(1.15, 0.86, 0.72);
      chest.add(pec);
      if (sx < 0) this.pecL = pec; else this.pecR = pec;
    }
    // abdominals
    for (let row = 0; row < 3; row++) {
      for (const sx of [-1, 1]) {
        const ab = new THREE.Mesh(sphere(0.05, 10, 8), suit);
        ab.position.set(sx * 0.048, 0.395 - row * 0.082, 0.152 - row * 0.012);
        ab.scale.set(1, 0.82, 0.5);
        chest.add(ab);
      }
    }
    // obliques / lats
    for (const sx of [-1, 1]) {
      const lat = new THREE.Mesh(sphere(0.1), suit);
      lat.position.set(sx * 0.185, 0.43, -0.03);
      lat.scale.set(0.72, 1.3, 0.85);
      chest.add(lat);
      // collarbone ridge
      const clav = new THREE.Mesh(capsule(0.026, 0.19, 3, 8), suit);
      clav.position.set(sx * 0.093, 0.615, 0.115);
      clav.rotation.set(0.3, 0, sx * (Math.PI / 2 - 0.35));
      chest.add(clav);
    }
    // traps
    const trap = new THREE.Mesh(sphere(0.14), suit);
    trap.position.set(0, 0.6, -0.035);
    trap.scale.set(1.5, 0.62, 0.75);
    chest.add(trap);

    // belt
    const belt = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.213, 0.208, 0.075, 24)), accent);
    belt.position.y = 0.045;
    belt.scale.z = 0.81;
    chest.add(belt);
    const buckle = new THREE.Mesh(keep(new THREE.BoxGeometry(0.1, 0.075, 0.04)), accentDark);
    buckle.position.set(0, 0.045, 0.168);
    chest.add(buckle);

    // ---- chest emblem (3D relief) ----
    if (pal.emblem === "invincible") {
      const emblem = new THREE.Group();
      emblem.position.set(0, 0.52, 0.195);
      emblem.rotation.x = -0.12;
      chest.add(emblem);
      // back plate
      const plate = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.105, 0.105, 0.028, 20)), suitDark);
      plate.rotation.x = Math.PI / 2;
      emblem.add(plate);
      // the "i": dot + slanted stem
      const dot = new THREE.Mesh(sphere(0.03, 12, 10), accent);
      dot.position.set(0.012, 0.055, 0.02);
      dot.scale.set(1, 0.7, 0.55);
      emblem.add(dot);
      const stem = new THREE.Mesh(keep(new THREE.BoxGeometry(0.038, 0.105, 0.026)), accent);
      stem.position.set(-0.012, -0.026, 0.02);
      stem.rotation.z = 0.2;
      emblem.add(stem);
      // orbit ring around the i
      const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.098, 0.011, 8, 26)), accent);
      ring.position.z = 0.022;
      emblem.add(ring);
    } else if (pal.emblem === "viltrum") {
      const emblem = new THREE.Group();
      emblem.position.set(0, 0.52, 0.2);
      emblem.rotation.x = -0.12;
      chest.add(emblem);
      const disc = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.1, 0.1, 0.024, 20)), mk(0xf6f7fc, { roughness: 0.4 }));
      disc.rotation.x = Math.PI / 2;
      emblem.add(disc);
      // harsh red chevron
      for (const sx of [-1, 1]) {
        const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(0.072, 0.028, 0.024)), mk(pal.accent, { roughness: 0.35 }));
        bar.position.set(sx * 0.024, 0, 0.016);
        bar.rotation.z = sx * -0.5;
        emblem.add(bar);
      }
    } else {
      // classic chevron bars
      for (const sx of [-1, 1]) {
        const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(0.185, 0.045, 0.03)), accent);
        bar.position.set(sx * 0.072, 0.492, 0.192);
        bar.rotation.z = sx * -0.56;
        bar.rotation.x = -0.18;
        chest.add(bar);
      }
    }

    // ================= head =================
    const neck = new THREE.Group();
    neck.position.y = 0.68;
    this.joints.neck = neck;
    chest.add(neck);
    const neckMesh = new THREE.Mesh(capsule(0.072, 0.14, 4, 10), pal.masked ? suit : skin);
    neckMesh.position.y = 0.03;
    neck.add(neckMesh);

    const head = new THREE.Group();
    head.position.y = 0.11;
    this.joints.head = head;
    neck.add(head);

    const skull = new THREE.Mesh(sphere(0.163, 20, 16), pal.masked ? suit : skin);
    skull.scale.set(0.95, 1.08, 1.02);
    skull.position.y = 0.035;
    head.add(skull);

    // jaw / chin
    const jaw = new THREE.Mesh(sphere(0.125, 16, 12), pal.masked ? suit : skin);
    jaw.position.set(0, -0.062, 0.022);
    jaw.scale.set(0.94, 0.8, 1.0);
    head.add(jaw);

    if (pal.masked) {
      // ---- Invincible cowl: full blue hood ----
      const cowl = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.176, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58)),
        suit,
      );
      cowl.scale.set(0.99, 1.12, 1.05);
      cowl.position.y = 0.04;
      head.add(cowl);
      const nape = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.172, 20, 16, 0, Math.PI * 2, Math.PI * 0.34, Math.PI * 0.34)),
        suit,
      );
      nape.scale.set(0.99, 1.1, 1.05);
      nape.position.set(0, 0.035, -0.028);
      nape.scale.z = 0.92;
      head.add(nape);
      // brow ridge
      const brow = new THREE.Mesh(keep(new THREE.TorusGeometry(0.156, 0.019, 8, 22, Math.PI * 0.86)), suitDark);
      brow.rotation.set(Math.PI / 2, 0, Math.PI * 1.28);
      brow.position.set(0, 0.082, 0.01);
      head.add(brow);
      // chin strap
      const strap = new THREE.Mesh(keep(new THREE.TorusGeometry(0.128, 0.014, 8, 22, Math.PI * 0.9)), suitDark);
      strap.rotation.set(Math.PI / 2 + 0.5, 0, Math.PI * 1.05);
      strap.position.set(0, -0.045, 0.05);
      head.add(strap);

      // ---- optional armored helmet ----
      if (pal.helmet) {
        const helmMat = mk(pal.suitDark, { metalness: 0.55, roughness: 0.3, clearcoat: 0.9 });
        const dome = new THREE.Mesh(keep(new THREE.SphereGeometry(0.185, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.62)), helmMat);
        dome.scale.set(1.02, 1.1, 1.08);
        dome.position.y = 0.045;
        head.add(dome);
        const fin = new THREE.Mesh(keep(new THREE.BoxGeometry(0.02, 0.16, 0.2)), mk(pal.accent, { metalness: 0.5, roughness: 0.3 }));
        fin.position.set(0, 0.2, -0.02);
        head.add(fin);
        for (const sx of [-1, 1]) {
          const pod = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12)), mk(pal.accent, { metalness: 0.5, roughness: 0.35 }));
          pod.rotation.z = Math.PI / 2;
          pod.position.set(sx * 0.165, 0.03, 0);
          head.add(pod);
        }
      }
      if (pal.visorGlow !== undefined) {
        const visor = new THREE.Mesh(
          keep(new THREE.TorusGeometry(0.152, 0.036, 10, 26, Math.PI * 1.16)),
          new THREE.MeshStandardMaterial({
            color: pal.visorGlow, emissive: new THREE.Color(pal.visorGlow),
            emissiveIntensity: 2.6, roughness: 0.15, metalness: 0.2,
          }),
        );
        visor.rotation.set(Math.PI / 2, 0, Math.PI * 1.42);
        visor.position.set(0, 0.028, 0.012);
        visor.scale.set(1.06, 1.06, 0.92);
        head.add(visor);
      }

      // ---- signature goggle visor ----
      const band = new THREE.Mesh(keep(new THREE.TorusGeometry(0.152, 0.038, 10, 26, Math.PI * 1.16)), accent);
      band.rotation.set(Math.PI / 2, 0, Math.PI * 1.42);
      band.position.set(0, 0.028, 0.012);
      band.scale.set(1.06, 1.06, 0.92);
      head.add(band);
      for (const sx of [-1, 1]) {
        const lens = new THREE.Mesh(sphere(0.055, 14, 12), this.eyeMat);
        lens.position.set(sx * 0.073, 0.03, 0.132);
        lens.scale.set(1.2, 0.78, 0.42);
        lens.rotation.z = sx * 0.16;
        head.add(lens);
        const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(0.062, 0.012, 8, 16)), accentDark);
        rim.position.set(sx * 0.073, 0.03, 0.138);
        rim.scale.set(1.16, 0.8, 1);
        rim.rotation.z = sx * 0.16;
        head.add(rim);
      }
      // nose ridge + mouth notch in the cowl
      const nose = new THREE.Mesh(keep(new THREE.ConeGeometry(0.028, 0.06, 8)), suitDark);
      nose.position.set(0, -0.012, 0.152);
      nose.rotation.x = Math.PI / 2 + 0.4;
      head.add(nose);
      const mouth = new THREE.Mesh(keep(new THREE.BoxGeometry(0.058, 0.012, 0.02)), mk(0x2a2118, { roughness: 0.85, clearcoat: 0 }));
      mouth.position.set(0, -0.088, 0.138);
      head.add(mouth);
      // ear pods
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(capsule(0.032, 0.085, 4, 8), accent);
        ear.position.set(sx * 0.157, 0.015, -0.012);
        ear.rotation.z = Math.PI / 2;
        head.add(ear);
      }
    } else {
      // ---- villain face: swept hair, brows, mustache ----
      const hairMat = mk(pal.hair ?? 0xffffff, { roughness: 0.68, clearcoat: 0.2 });
      const hair = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.178, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.56)),
        hairMat,
      );
      hair.scale.set(1.0, 1.1, 1.06);
      hair.position.y = 0.048;
      head.add(hair);
      for (const sx of [-1, 1]) {
        const sweep = new THREE.Mesh(capsule(0.035, 0.16, 4, 8), hairMat);
        sweep.position.set(sx * 0.14, 0.045, -0.03);
        sweep.rotation.set(0.3, 0, sx * 0.42);
        head.add(sweep);
        const brow = new THREE.Mesh(capsule(0.017, 0.075, 3, 6), hairMat);
        brow.position.set(sx * 0.068, 0.062, 0.128);
        brow.rotation.set(0, 0, sx * 0.3 + Math.PI / 2);
        head.add(brow);
        const eye = new THREE.Mesh(sphere(0.032, 12, 10), this.eyeMat);
        eye.position.set(sx * 0.068, 0.022, 0.133);
        eye.scale.set(1.15, 0.85, 0.55);
        head.add(eye);
      }
      // villain nose
      const nose = new THREE.Mesh(keep(new THREE.ConeGeometry(0.026, 0.07, 6)), skin);
      nose.position.set(0, -0.008, 0.152);
      nose.rotation.x = Math.PI / 2 + 0.5;
      head.add(nose);
      const mouth = new THREE.Mesh(keep(new THREE.BoxGeometry(0.062, 0.011, 0.02)), mk(0x7d4436, { roughness: 0.85, clearcoat: 0 }));
      mouth.position.set(0, -0.088, 0.138);
      head.add(mouth);
      if (pal.mustache) {
        const mustMat = mk(0x2b2119, { roughness: 0.85, clearcoat: 0 });
        for (const sx of [-1, 1]) {
          const m = new THREE.Mesh(capsule(0.024, 0.1, 4, 8), mustMat);
          m.position.set(sx * 0.038, -0.072, 0.13);
          m.rotation.set(0.1, 0, Math.PI / 2 + sx * 0.22);
          head.add(m);
        }
      }
    }

    // ================= limbs =================
    const buildArm = (sx: number, shName: JointName, elName: JointName, wrName: JointName) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.29, 0.56, 0);
      chest.add(sh);
      this.joints[shName] = sh;

      // deltoid
      if (pal.shoulders) {
        const pauldron = new THREE.Mesh(sphere(0.152), mk(pal.accentDark, { metalness: 0.45, roughness: 0.34, clearcoat: 0.8 }));
        pauldron.position.y = 0.03;
        pauldron.scale.set(1.02, 0.82, 1.02);
        sh.add(pauldron);
      }
      const delt = new THREE.Mesh(sphere(0.115), suit);
      delt.scale.set(1.05, 1.12, 1.05);
      sh.add(delt);
      // armor pauldron — layered composite cap over the shoulder
      const pauldron = new THREE.Mesh(sphere(0.128, 16, 12, ), suitDark);
      pauldron.scale.set(1.08, 0.78, 1.1);
      pauldron.position.y = 0.028;
      sh.add(pauldron);
      const pauldronLip = new THREE.Mesh(keep(new THREE.TorusGeometry(0.117, 0.016, 8, 20)), accent);
      pauldronLip.rotation.x = Math.PI / 2;
      pauldronLip.position.y = -0.048;
      sh.add(pauldronLip);
      const ridge = new THREE.Mesh(capsule(0.02, 0.16, 3, 8), accent);
      ridge.position.set(0, 0.105, 0.02);
      ridge.rotation.set(0.2, 0, sx * 0.55);
      sh.add(ridge);
      // shoulder trim ring
      const trim = new THREE.Mesh(keep(new THREE.TorusGeometry(0.104, 0.017, 8, 18)), accent);
      trim.rotation.x = Math.PI / 2;
      trim.position.y = -0.055;
      sh.add(trim);

      const upper = new THREE.Mesh(capsule(0.077, 0.335), suit);
      upper.position.y = -0.168;
      sh.add(upper);
      // bicep
      const bicep = new THREE.Mesh(sphere(0.084), suit);
      bicep.position.set(0, -0.135, 0.022);
      bicep.scale.set(1, 1.24, 1.02);
      sh.add(bicep);
      if (sx < 0) this.bicepL = bicep; else this.bicepR = bicep;
      // triceps
      const tri = new THREE.Mesh(sphere(0.072), suit);
      tri.position.set(0, -0.175, -0.032);
      tri.scale.set(0.92, 1.25, 0.85);
      sh.add(tri);

      const el = new THREE.Group();
      el.position.y = -0.335;
      sh.add(el);
      this.joints[elName] = el;

      const elbow = new THREE.Mesh(sphere(0.071, 12, 10), suitDark);
      el.add(elbow);
      const fore = new THREE.Mesh(capsule(0.066, 0.32), suit);
      fore.position.y = -0.16;
      el.add(fore);
      // forearm taper mass
      const brach = new THREE.Mesh(sphere(0.073), suit);
      brach.position.y = -0.105;
      brach.scale.set(1, 1.18, 1);
      el.add(brach);

      // ---- glove ----
      const cuff = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.081, 0.073, 0.1, 14)), accent);
      cuff.position.y = -0.256;
      el.add(cuff);
      const cuffLip = new THREE.Mesh(keep(new THREE.TorusGeometry(0.082, 0.014, 8, 16)), accentDark);
      cuffLip.rotation.x = Math.PI / 2;
      cuffLip.position.y = -0.208;
      el.add(cuffLip);

      const wr = new THREE.Group();
      wr.position.y = -0.3;
      el.add(wr);
      this.joints[wrName] = wr;

      // palm
      const palm = new THREE.Mesh(sphere(0.062, 12, 10), accent);
      palm.position.y = -0.03;
      palm.scale.set(1.1, 1.15, 0.72);
      wr.add(palm);
      // knuckles
      for (let k = 0; k < 4; k++) {
        const kn = new THREE.Mesh(sphere(0.021, 8, 6), accentDark);
        kn.position.set((k - 1.5) * 0.031, -0.062, 0.045);
        kn.scale.set(0.9, 0.9, 0.75);
        wr.add(kn);
      }
      // curled fingers
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Mesh(capsule(0.019, 0.066, 3, 6), accent);
        f.position.set((k - 1.5) * 0.031, -0.083, 0.022);
        f.rotation.x = -1.15;
        wr.add(f);
      }
      // thumb
      const thumb = new THREE.Mesh(capsule(0.022, 0.07, 3, 6), accent);
      thumb.position.set(sx * 0.055, -0.045, 0.038);
      thumb.rotation.set(-0.7, 0, sx * 0.85);
      wr.add(thumb);

      const anchor = sx < 0 ? this.fistL : this.fistR;
      anchor.position.set(0, -0.09, 0.07);
      wr.add(anchor);
    };

    const buildLeg = (sx: number, hipName: JointName, kneeName: JointName, ankName: JointName) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.13, -0.14, 0);
      spine.add(hip);
      this.joints[hipName] = hip;

      const glute = new THREE.Mesh(sphere(0.115), suit);
      glute.position.set(0, -0.02, -0.035);
      glute.scale.set(1, 0.95, 1.05);
      hip.add(glute);

      const thigh = new THREE.Mesh(capsule(0.108, 0.42), suit);
      thigh.position.y = -0.21;
      hip.add(thigh);
      // quad
      const quad = new THREE.Mesh(sphere(0.112), suit);
      quad.position.set(0, -0.17, 0.026);
      quad.scale.set(1, 1.32, 1);
      hip.add(quad);
      // hamstring
      const ham = new THREE.Mesh(sphere(0.098), suit);
      ham.position.set(0, -0.2, -0.03);
      ham.scale.set(0.94, 1.3, 0.86);
      hip.add(ham);

      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      this.joints[kneeName] = knee;

      const kneePad = new THREE.Mesh(sphere(0.094, 12, 10), suitDark);
      kneePad.scale.set(1, 0.95, 1.08);
      knee.add(kneePad);

      const shin = new THREE.Mesh(capsule(0.086, 0.4), suit);
      shin.position.y = -0.2;
      knee.add(shin);
      // calf (gastrocnemius + soleus split)
      const calf = new THREE.Mesh(sphere(0.09), suit);
      calf.position.set(0, -0.13, -0.034);
      calf.scale.set(0.92, 1.24, 0.9);
      knee.add(calf);
      const soleus = new THREE.Mesh(sphere(0.07), suit);
      soleus.position.set(0, -0.23, -0.022);
      soleus.scale.set(0.85, 1.3, 0.8);
      knee.add(soleus);

      // ---- boot with flared cuff ----
      const cuffTop = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.122, 0.104, 0.1, 14)), accent);
      cuffTop.position.y = -0.2;
      knee.add(cuffTop);
      const cuffLip = new THREE.Mesh(keep(new THREE.TorusGeometry(0.123, 0.016, 8, 16)), accentDark);
      cuffLip.rotation.x = Math.PI / 2;
      cuffLip.position.y = -0.152;
      knee.add(cuffLip);
      const shinGuard = new THREE.Mesh(keep(new THREE.ConeGeometry(0.104, 0.16, 14, 1, true)), suitDark);
      shinGuard.position.y = -0.26;
      shinGuard.rotation.x = Math.PI;
      knee.add(shinGuard);

      const ank = new THREE.Group();
      ank.position.y = -0.4;
      knee.add(ank);
      this.joints[ankName] = ank;

      const boot = new THREE.Mesh(capsule(0.092, 0.2, 4, 12), accent);
      boot.position.y = -0.06;
      ank.add(boot);
      const foot = new THREE.Mesh(keep(new THREE.BoxGeometry(0.125, 0.085, 0.255)), accent);
      foot.position.set(0, -0.13, 0.055);
      ank.add(foot);
      const toe = new THREE.Mesh(sphere(0.062, 12, 8), accent);
      toe.position.set(0, -0.132, 0.17);
      toe.scale.set(1, 0.72, 0.85);
      ank.add(toe);
      const sole = new THREE.Mesh(keep(new THREE.BoxGeometry(0.128, 0.028, 0.28)), suitDark);
      sole.position.set(0, -0.168, 0.06);
      ank.add(sole);
    };

    buildArm(-1, "shL", "elL", "wrL");
    buildArm(1, "shR", "elR", "wrR");
    buildLeg(-1, "hipL", "kneeL", "ankL");
    buildLeg(1, "hipR", "kneeR", "ankR");

    // ================= cape =================
    if (pal.cape !== undefined) {
      const capeMat = new THREE.MeshPhysicalMaterial({
        color: pal.cape, roughness: 0.82, metalness: 0.02,
        side: THREE.DoubleSide, sheen: 0.6,
        sheenColor: new THREE.Color(pal.capeInner ?? pal.cape),
      });
      this.mats.push(capeMat);
      this.cape = new THREE.Group();
      this.cape.position.set(0, 0.6, -0.12);
      chest.add(this.cape);

      const collar = new THREE.Mesh(keep(new THREE.TorusGeometry(0.2, 0.036, 8, 20, Math.PI)), capeMat);
      collar.rotation.set(Math.PI / 2, 0, 0);
      collar.position.set(0, 0.04, 0.02);
      this.cape.add(collar);

      let parent: THREE.Object3D = this.cape;
      const lens = [0.3, 0.32, 0.32, 0.32, 0.3, 0.28, 0.24];
      const wids = [0.5, 0.62, 0.72, 0.78, 0.74, 0.62, 0.46];
      for (let i = 0; i < lens.length; i++) {
        const g = new THREE.Group();
        g.position.y = i === 0 ? 0 : -lens[i - 1];
        parent.add(g);
        const seg = new THREE.Mesh(keep(new THREE.PlaneGeometry(wids[i], lens[i], 4, 2)), capeMat);
        seg.position.y = -lens[i] / 2;
        g.add(seg);
        this.capeSegs.push(g);
        this.capeAng.push(0);
        parent = g;
      }
    }

    // ================= aura =================
    this.auraMat = new THREE.MeshBasicMaterial({
      color: 0xffa33c, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    });
    this.aura = new THREE.Mesh(keep(new THREE.SphereGeometry(1.05, 18, 14)), this.auraMat);
    this.aura.position.y = 0.25;
    this.aura.scale.set(0.85, 1.35, 0.85);
    this.aura.visible = false;
    this.group.add(this.aura);

    this.group.scale.setScalar(scale);
    this.setPoseImmediate(POSES.idle);
  }

  /* ---------------- pose blending ---------------- */

  setPoseImmediate(pose: Pose): void {
    for (const k of Object.keys(this.joints) as JointName[]) {
      const t = pose[k];
      const j = this.joints[k];
      if (t) j.rotation.set(t[0], t[1], t[2]);
      else j.rotation.set(0, 0, 0);
    }
  }

  /**
   * Procedural ground locomotion: a full walk/run cycle driven by phase.
   * k = gait intensity (0 idle → 1 full sprint). Returns the pose to blend.
   */
  walkPose(phase: number, k: number): Pose {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const run = k;
    const amp = 0.62 * run;
    // legs: hips swing opposite; knee bends on the swing-through leg
    const hipL = -s * amp;
    const hipR = s * amp;
    const kneeL = Math.max(0, -c * s) * 1.15 * run + 0.08;
    const kneeR = Math.max(0, c * s) * 1.15 * run + 0.08;
    return {
      spine: [0.14 + run * 0.22, s * 0.06 * run, 0],
      chest: [0.06 + run * 0.16, -s * 0.07 * run, 0],
      neck: [-0.1 - run * 0.14, 0, 0],
      head: [0.04, 0, 0],
      // arms counter-swing, fists half-cocked
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
  }

  /* ---------------- clip player ---------------- */

  /** start a keyframed action; overrides the locomotion pose briefly */
  playClip(name: string, rate = 1): void {
    const def = CLIPS[name];
    if (!def) return;
    this.clipDef = { dur: def.dur / Math.max(0.2, rate), keys: def.keys };
    this.clipT = 0;
    this.clipW = 0;
  }

  clipActive(): boolean { return this.clipDef !== null; }

  /** advance + apply the current action clip over the base pose */
  updateClip(dt: number): void {
    const def = this.clipDef;
    if (!def) return;
    this.clipT += dt;
    const k = this.clipT / def.dur;
    if (k >= 1) {
      // release — blend weight ramps out so locomotion takes over smoothly
      this.clipW = Math.max(0, this.clipW - dt * 9);
      if (this.clipW <= 0.01) { this.clipDef = null; this.clipW = 0; }
    } else {
      // weight snaps in fast so the impact reads immediately
      this.clipW = Math.min(1, this.clipW + dt * 26);
    }

    // sample the clip at time k
    this.samplePose(k, def.keys);
    const w = this.clipW * (k >= 1 ? 1 : 1);
    for (const name of Object.keys(this.sample) as JointName[]) {
      const j = this.joints[name];
      if (!j) continue;
      const t = this.sample[name]!;
      j.rotation.x += (t[0] - j.rotation.x) * w;
      j.rotation.y += (t[1] - j.rotation.y) * w;
      j.rotation.z += (t[2] - j.rotation.z) * w;
    }
  }

  private samplePose(k: number, keys: ClipKey[]): void {
    this.sample = {};
    if (k <= keys[0].t) { this.sample = keys[0].pose; return; }
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (k >= a.t && k <= b.t) {
        let u = (k - a.t) / Math.max(1e-5, b.t - a.t);
        switch (a.ease) {
          case "in": u = u * u * u; break;           // accelerate into the hit
          case "out": u = 1 - Math.pow(1 - u, 3); break; // snap out fast
          case "lin": break;
          default: u = u * u * (3 - 2 * u); break;   // smoothstep
        }
        const joints = new Set([...Object.keys(a.pose), ...Object.keys(b.pose)] as JointName[]);
        for (const name of joints) {
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

  /** wind flutter + idle breathing layered over the base pose */
  addFlutter(t: number, amount: number): void {
    // breathing always reads on the chest
    this.breath = Math.sin(t * 1.7) * 0.5 + 0.5;
    const b = 1 + this.breath * 0.022;
    this.chestMesh.scale.set(b, 1 + this.breath * 0.008, b);
    this.pecL.scale.set(1.15 * b, 0.86, 0.72 * b);
    this.pecR.scale.set(1.15 * b, 0.86, 0.72 * b);

    if (amount <= 0.001) return;
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

  /** turn the head toward a world point (soft, clamped) */
  lookAt(target: THREE.Vector3 | null, k: number): void {
    const head = this.joints.head;
    if (!target) {
      head.rotation.y += (0 - head.rotation.y) * k;
      return;
    }
    const local = this.group.worldToLocal(target.clone());
    const yaw = Math.atan2(local.x, Math.max(0.2, local.z));
    const clamped = Math.max(-0.6, Math.min(0.6, yaw));
    head.rotation.y += (clamped - head.rotation.y) * k;
  }

  /** 0..1 muscle flex for punches */
  setFlex(v: number): void {
    this.flex += (v - this.flex) * 0.35;
    const f = 1 + this.flex * 0.28;
    this.bicepL.scale.set(f, 1.24 * (1 + this.flex * 0.1), f);
    this.bicepR.scale.set(f, 1.24 * (1 + this.flex * 0.1), f);
  }

  setEyeGlow(color: number, intensity: number): void {
    this.eyeMat.color.setHex(color);
    this.eyeMat.emissive.setHex(color);
    this.eyeMat.emissiveIntensity = intensity;
  }

  setAura(on: boolean, color: number, strength: number): void {
    if (!this.aura || !this.auraMat) return;
    this.aura.visible = on && strength > 0.001;
    this.auraMat.color.setHex(color);
    this.auraMat.opacity = strength;
  }

  updateCape(dt: number, localSpeed: number, t: number): void {
    if (!this.cape) return;
    const target = Math.min(1.4, localSpeed * 0.022);
    for (let i = 0; i < this.capeSegs.length; i++) {
      const g = this.capeSegs[i];
      const want = target * (0.5 + i * 0.14) + Math.sin(t * 5.2 + i * 0.9) * (0.05 + target * 0.1);
      this.capeAng[i] += (want - this.capeAng[i]) * Math.min(1, dt * 7);
      g.rotation.x = this.capeAng[i];
      g.rotation.z = Math.sin(t * 3.4 + i * 0.8) * 0.055 * (0.4 + target);
      g.rotation.y = Math.sin(t * 2.2 + i * 0.5) * 0.04 * (0.3 + target);
    }
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
