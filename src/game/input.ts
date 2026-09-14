// ---------- Unified input: keyboard + touch joystick + buttons (3D) ----------

export type TapName = "strike" | "dash" | "slam" | "cyclone" | "over" | "grab" | "bolt" | "pause"
  | "meteor" | "chain" | "bubble" | "missile";

const taps: Record<TapName, number> = { strike: 0, dash: 0, slam: 0, cyclone: 0, over: 0, grab: 0, bolt: 0, pause: 0, meteor: 0, chain: 0, bubble: 0, missile: 0 };

/** held buttons (keyboard) */
export const hold = { blast: false, strike: false, up: false, down: false, block: false, vision: false };

/** held buttons (touch) — kept separate so key repaints can't clobber them */
export const touch = { up: false, down: false, blast: false, strike: false, block: false, vision: false };

/** digital keyboard move axis */
export const kb = { x: 0, y: 0 };

/** analog joystick (screen space: y+ = down/back) */
export const pad = { x: 0, y: 0, mag: 0, active: false };

/** right flight stick (y+ = descend) */
export const pad2 = { x: 0, y: 0, mag: 0, active: false };

export function tap(n: TapName): void { taps[n] += 1; }

export function take(n: TapName): boolean {
  if (taps[n] > 0) { taps[n] = 0; return true; }
  return false;
}

export function clearAll(): void {
  (Object.keys(taps) as TapName[]).forEach((k) => { taps[k] = 0; });
  hold.blast = false; hold.strike = false; hold.up = false; hold.down = false; hold.block = false; hold.vision = false;
  touch.up = false; touch.down = false; touch.blast = false; touch.strike = false; touch.block = false; touch.vision = false;
  kb.x = 0; kb.y = 0;
  pad.x = 0; pad.y = 0; pad.mag = 0; pad.active = false;
  pad2.x = 0; pad2.y = 0; pad2.mag = 0; pad2.active = false;
  for (const k in keys) delete keys[k];
}

const DEAD = 0.12;

/**
 * Move input from stick or keyboard; y+ means "forward/away from camera".
 * Applies a dead-zone and an expo response curve so small stick movements
 * give fine control while full deflection still hits max speed.
 */
export function moveAxis(): { x: number; y: number; mag: number } {
  let x = pad.active ? pad.x : kb.x;
  let y = pad.active ? pad.y : kb.y;
  let l = Math.hypot(x, y);
  if (l < 1e-5) return { x: 0, y: 0, mag: 0 };
  if (l > 1) { x /= l; y /= l; l = 1; }

  if (pad.active) {
    if (l <= DEAD) return { x: 0, y: 0, mag: 0 };
    // rescale past the dead-zone, then apply expo
    const t = (l - DEAD) / (1 - DEAD);
    const curved = t * t * 0.55 + t * 0.45;
    const k = curved / l;
    x *= k; y *= k; l = curved;
  }
  return { x, y: -y, mag: Math.min(1, l) };
}

/** vertical thrust: +1 up, -1 down (flight stick overrides buttons) */
export function vertAxis(): number {
  if (pad2.active && pad2.mag > 0.14) {
    // screen y+ = down → thrust down
    const t = -(pad2.y);
    return Math.abs(t) < 0.14 ? 0 : Math.sign(t) * Math.min(1, (Math.abs(t) - 0.14) / 0.72);
  }
  const up = hold.up || touch.up;
  const down = hold.down || touch.down;
  return (up ? 1 : 0) - (down ? 1 : 0);
}

/** lateral thrust from the flight stick: -1 left … +1 right (camera-relative) */
export function strafeAxis(): number {
  if (!pad2.active || pad2.mag <= 0.14) return 0;
  const t = pad2.x;
  return Math.abs(t) < 0.14 ? 0 : Math.sign(t) * Math.min(1, (Math.abs(t) - 0.14) / 0.72);
}

/** true if strike is held on either device */
export function holdStrike(): boolean { return hold.strike || touch.strike; }
export function holdBlast(): boolean { return hold.blast || touch.blast; }
export function holdBlock(): boolean { return hold.block || touch.block; }
export function holdVision(): boolean { return hold.vision || touch.vision; }

const keys: Record<string, boolean> = {};

function recompute(): void {
  const l = keys["ArrowLeft"] || keys["KeyA"] ? 1 : 0;
  const r = keys["ArrowRight"] || keys["KeyD"] ? 1 : 0;
  const u = keys["ArrowUp"] || keys["KeyW"] ? 1 : 0;
  const d = keys["ArrowDown"] || keys["KeyS"] ? 1 : 0;
  kb.x = r - l;
  kb.y = d - u;
  hold.up = !!keys["Space"];
  hold.down = !!(keys["KeyC"] || keys["ControlLeft"]);
}

let installed = false;
export function installKeyboard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("keydown", (e) => {
    const c = e.code;
    if (c === "Space" || c.startsWith("Arrow")) e.preventDefault();
    keys[c] = true;
    recompute();
    if (e.repeat) return;
    switch (c) {
      case "KeyJ": tap("strike"); hold.strike = true; break;
      case "KeyK": hold.blast = true; break;
      case "ShiftLeft": case "ShiftRight": case "KeyQ": tap("dash"); break;
      case "KeyL": tap("slam"); break;
      case "KeyH": case "KeyF": tap("cyclone"); break;
      case "KeyB": case "KeyE": hold.block = true; break;
      case "KeyG": tap("grab"); break;
      case "KeyV": hold.vision = true; break;
      case "KeyT": tap("bolt"); break;
      case "KeyI": case "KeyU": tap("over"); break;
      case "KeyP": case "Escape": tap("pause"); break;
    }
  });

  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
    recompute();
    if (e.code === "KeyJ") hold.strike = false;
    if (e.code === "KeyK") hold.blast = false;
    if (e.code === "KeyB" || e.code === "KeyE") hold.block = false;
    if (e.code === "KeyV") hold.vision = false;
  });

  window.addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
    recompute();
    hold.blast = false; hold.strike = false; hold.block = false; hold.vision = false;
  });
}
