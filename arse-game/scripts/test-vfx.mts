/* v6.5 VFX tripwire: skin themes + perf wiring. Run: npx esbuild scripts/test-vfx.mts --bundle --platform=node --format=cjs --outfile=/tmp/test-vfx.cjs && node /tmp/test-vfx.cjs */
import { readFileSync, existsSync } from "node:fs";
import { SKIN_FX, fxById, SKINS } from "../src/game3d/character";
import { qualityProfile } from "../src/game/settings";

let fail = false;
function check(name: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) fail = true;
}

// --- theme table integrity ---
check("themes: classic exists", !!SKIN_FX.classic);
check("themes: all 6 skins have fx rows", SKINS.every((s) => {
  const f = SKIN_FX[s.id];
  return !!f && ["eye", "trail", "fist", "bolt", "auraOd", "auraDash", "shield"].every((k) => typeof (f as any)[k] === "number");
}));
check("themes: classic keeps legacy values",
  SKIN_FX.classic.trail === 0xaad6ff && SKIN_FX.classic.bolt === 0xffd23f &&
  SKIN_FX.classic.shield === 0x6ecbff && SKIN_FX.classic.eye === 0xffffff);
check("themes: fxById fallback returns classic", fxById("nope" as any) === SKIN_FX.classic);
check("themes: non-classic differs from classic", ["omni", "midnight", "solar", "viltrum", "nova"].every((id) => {
  const f = SKIN_FX[id];
  return f.eye !== 0xffffff || f.bolt !== 0xffd23f || f.trail !== 0xaad6ff;
}));

// --- perf profile wiring ---
check("quality: particle field exists (0.45/0.75/1)",
  qualityProfile("low").particle === 0.45 &&
  qualityProfile("medium").particle === 0.75 &&
  qualityProfile("ultra").particle === 1);

// --- source wiring (string checks, run from repo root) ---
const E = readFileSync("src/game3d/engine.ts", "utf8");
const F = readFileSync("src/game3d/fx.ts", "utf8");
const H = readFileSync("src/game3d/heroModel.ts", "utf8");
check("engine: BODY_CY uplift constant", E.includes("const BODY_CY = 1.7"));
check("engine: >=15 uplifted hero-fx origins", (E.match(/BODY_CY/g) || []).length >= 15);
check("engine: fx.setQuality wired (ctor + applySettings)", (E.match(/fx\.setQuality\(qp\.particle\)/g) || []).length === 2);
check("engine: vision from eyeAnchor", E.includes("this.rig.eyeAnchor.getWorldPosition(this._v3)"));
check("engine: blast from cast palms", E.includes("this.rig.fistL.getWorldPosition(this._v)") && E.includes("this.rig.fistR.getWorldPosition(this._v3)"));
check("engine: flight trail from chestAnchor",
  E.includes("this.trail.reset(this.rig.chestAnchor.getWorldPosition(this._v))") &&
  E.includes("this.trail.update(this.rig.chestAnchor.getWorldPosition(this._v)"));
check("engine: trail/eyes/bolt themed per skin",
  E.includes("fxById(this.activeSkin).trail") && E.includes("fxById(this.activeSkin).bolt") &&
  E.includes("applySkinFx("));
check("engine: shield flight morph",
  E.includes("this.shield.position.set(0, 1.5 + fk * 0.3, 0.1 - fk * 0.15)") &&
  E.includes("this.shield.scale.set(0.62 + fk * 0.13, 1.15 - fk * 0.55, 0.62 + fk * 0.63)"));
check("fx: emitter scaling exists", F.includes("setQuality(scale: number)"));
check("fx: idle upload skip", F.includes("!p.dirty") && F.includes("p.dirty = false"));
check("fx: Trail.setColor", F.includes("setColor(hex: number)"));
check("heroModel: eyeAnchor on head bone", H.includes("this.bones.head.add(this.eyeAnchor)"));
check("heroModel: aura flight morph", H.includes("_auraScale.set(fly ? 0.8 : 0.95"));
check("laser: baked GLB asset exists", existsSync("src/assets/laser.glb"));
check("engine: hero laser bolts wired",
  E.includes('import laserUrl from "../assets/laser.glb"') &&
  E.includes("s.laser.visible = useLaser") && E.includes("LASER_W, LASER_W, LASER_L") &&
  E.includes("s.col = color"));

process.exit(fail ? 1 : 0);
