// v6.4 routing tripwire: hero flight + menu must route to flyM (user's Flying),
// dash keeps the diveM missile. Guards the exact engine/heroModel lines so the
// cruise-fist regression can never silently return. Run: node scripts/test-routing.mjs
import fs from "node:fs";
const E = fs.readFileSync("src/game3d/engine.ts", "utf8");
const H = fs.readFileSync("src/game3d/heroModel.ts", "utf8");
let fail = 0;
const check = (n, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}`); if (!ok) fail++; };
check("cruise routes to POSES.fly", E.includes("else if (this.flyK > 0.55) { pose = POSES.fly; blend = 7; }"));
check("old cruise-fist branch gone", !E.includes("cruise > 0.5 ? POSES.fist"));
check("cruise pitch uses level-flight branch", !E.includes("(this.flyK > 0.55 && this.cruise > 0.5)"));
check("dash keeps steep diveM pitch", E.includes("this.dashT > 0 ? -1.0 - climb * 0.5"));
check("dash still POSES.dash", E.includes("pose = POSES.dash;"));
check("menu showcases POSES.fly", E.includes("this.rig.blendPose(POSES.fly, Math.min(1, dt * 4));"));
check("menu pitch level (-0.2)", E.includes("lerp(this.rig.body.rotation.x, -0.2, 1 - Math.exp(-3 * dt))"));
check("heroModel: fly->flyM loop", H.includes('pose === POSES.fly || pose === POSES.slamUp || pose === POSES.slamDown) { this.requestBase("flyM", false, xf);'));
check("heroModel: fist/dash->diveM hold", H.includes('pose === POSES.fist || pose === POSES.dash) { this.requestBase("diveM", true, xf);'));
check("heroModel: flyM gaze -0.72", H.includes('baseName === "flyM" ? -0.72'));
check("v6.5: steering right = fwd x up (left/right not inverted)",
  E.includes("this._right.set(-this._fwd.z, 0, this._fwd.x);") && !E.includes("this._right.set(this._fwd.z, 0, -this._fwd.x);"));
process.exit(fail ? 1 : 0);
