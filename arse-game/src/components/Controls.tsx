import { useEffect, useRef, useState } from "react";
import {
  Hand, Zap, Wind, ArrowDownToLine, Tornado, CloudLightning, Flame, Grab,
  Sparkles, Workflow, CircleDot, Rocket, Shield, BatteryCharging,
} from "lucide-react";
import type { Engine } from "../game3d/engine";
import {
  pad, pad2, tap, touch,
  type TapName,
} from "../game/input";
import { abilityById, type AbilityDef } from "../game/abilities";

/* ------------------------------------------------------------------ */
/*  Twin-stick touch controls:                                         */
/*   · left  stick — move (ground + flight)                            */
/*   · right stick — flight: up/down altitude + left/right strafe      */
/*   · ability cluster driven by the loadout, with cooldown arcs       */
/* ------------------------------------------------------------------ */

const ICONS: Record<string, typeof Hand> = {
  strike: Hand, blast: Zap, dash: Wind, slam: ArrowDownToLine,
  cyclone: Tornado, bolt: CloudLightning, vision: Flame, grab: Grab,
  meteor: Sparkles, chain: Workflow, bubble: CircleDot, missile: Rocket,
};

function pressAbility(a: AbilityDef): void {
  if (a.kind === "hold") {
    if (a.id === "strike") { touch.strike = true; tap("strike"); }
    else if (a.id === "blast") touch.blast = true;
    else if (a.id === "vision") touch.vision = true;
  } else {
    tap(a.id as TapName);
  }
}

function releaseAbility(a: AbilityDef): void {
  if (a.id === "strike") touch.strike = false;
  else if (a.id === "blast") touch.blast = false;
  else if (a.id === "vision") touch.vision = false;
}

/* ---------- one ability button ---------- */
function AbilityBtn({ a, register, onHold }: {
  a: AbilityDef;
  register: (id: string, el: HTMLDivElement | null) => void;
  onHold: (a: AbilityDef, el: HTMLButtonElement | null, down: boolean) => void;
}) {
  const Icon = ICONS[a.id] ?? Hand;
  const cdRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    register(a.id, cdRef.current);
    return () => register(a.id, null);
  }, [a.id, register]);
  return (
    <button
      aria-label={a.name}
      className="abtn h-[48px] w-[48px]"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        onHold(a, e.currentTarget, true);
      }}
      onPointerUp={() => onHold(a, null, false)}
      onPointerCancel={() => onHold(a, null, false)}
      onPointerLeave={(e) => { if (e.buttons === 0) return; onHold(a, null, false); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon size={20} strokeWidth={2.6} />
      <span className="pointer-events-none font-hud text-[7px] font-bold leading-none tracking-[0.06em] text-indigo-100/90">{a.fa}</span>
      <div
        ref={cdRef}
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: "conic-gradient(rgba(4,6,16,0.66) 0deg, transparent 0deg)" }}
      />
    </button>
  );
}

/* ================================================================== */
export default function Controls({ game, loadout }: { game: Engine; loadout: string[] }) {
  /* ---------- left stick state ---------- */
  const [joy, setJoy] = useState<{ id: number; ax: number; ay: number; bx: number; by: number; dx: number; dy: number } | null>(null);
  const [everUsed, setEverUsed] = useState(false);
  const maxedRef = useRef(false);

  /* ---------- right flight-pad state (whole right half of the screen) ---------- */
  const [joy2, setJoy2] = useState<{ id: number; ax: number; ay: number; bx: number; by: number; dx: number; dy: number } | null>(null);
  const [everUsed2, setEverUsed2] = useState(false);
  const maxed2Ref = useRef(false);

  /* ---------- fixed buttons (overdrive / brace) ---------- */
  const [odOn, setOdOn] = useState(false);
  const [braceOn, setBraceOn] = useState(false);

  /* ---------- cooldown arc refs ---------- */
  const cdEls = useRef(new Map<string, HTMLDivElement>());

  const register = useRef((id: string, el: HTMLDivElement | null) => {
    if (el) cdEls.current.set(id, el);
    else cdEls.current.delete(id);
  }).current;

  /* ---------- raf: cooldown arcs ---------- */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const cds = game.hud.cds;
      const cdMax = game.hud.cdMax;
      for (const [id, el] of cdEls.current) {
        const c = cds[id] ?? 0;
        const m = cdMax[id] ?? 1;
        const k = m > 0.05 ? Math.max(0, Math.min(1, c / m)) : 0;
        el.style.background = `conic-gradient(rgba(4,6,16,0.66) ${k * 360}deg, transparent ${k * 360}deg)`;
        el.style.opacity = k > 0.02 ? "1" : "0";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  /* ---------- stuck-hold safety net ---------- */
  const releaseRef = useRef<(a: AbilityDef) => void>(() => {});
  releaseRef.current = (a: AbilityDef) => releaseAbility(a);
  useEffect(() => {
    const active = new Set<number>();
    const holds = new Map<number, AbilityDef>();
    const dn = (e: PointerEvent) => { active.add(e.pointerId); };
    const up = (e: PointerEvent) => {
      active.delete(e.pointerId);
      const a = holds.get(e.pointerId);
      if (a) { holds.delete(e.pointerId); releaseRef.current(a); }
      // no touch pointers left anywhere → nothing may stay held
      if (active.size === 0 && e.pointerType !== "mouse") {
        touch.strike = false; touch.blast = false; touch.vision = false;
        touch.up = false; touch.down = false; touch.block = false;
        setOdOn(false); setBraceOn(false);
      }
    };
    window.addEventListener("pointerdown", dn, { capture: true, passive: true });
    window.addEventListener("pointerup", up, { capture: true, passive: true });
    window.addEventListener("pointercancel", up, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", dn, { capture: true, passive: true } as EventListenerOptions);
      window.removeEventListener("pointerup", up, { capture: true, passive: true } as EventListenerOptions);
      window.removeEventListener("pointercancel", up, { capture: true, passive: true } as EventListenerOptions);
    };
  }, []);
  useEffect(() => () => {
    pad.active = false; pad2.active = false;
    touch.blast = false; touch.strike = false; touch.vision = false;
    touch.up = false; touch.down = false; touch.block = false;
  }, []);

  const holdWrap = (a: AbilityDef, _el: HTMLButtonElement | null, down: boolean) => {
    if (down) pressAbility(a);
    else releaseAbility(a);
  };

  /* ---------- auto-scale (one ability cluster: 3×2 grid + brace/OD row) ---------- */
  const [scale, setScale] = useState({ c: 1 });
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth, h = window.innerHeight;
      // cluster design: 176w × ~176h
      const c = Math.max(0.55, Math.min(1, (w * 0.62) / 176, (h * 0.44) / 176));
      setScale({ c });
    };
    calc();
    window.addEventListener("resize", calc);
    window.addEventListener("orientationchange", calc);
    return () => { window.removeEventListener("resize", calc); window.removeEventListener("orientationchange", calc); };
  }, []);

  /* ---------- joysticks (leashed dynamic base) ---------- */
  const MAXR = 58, LEASH = 84;
  const MAXR2 = 54, LEASH2 = 76;

  const onZoneDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joy) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ok */ }
    setEverUsed(true);
    maxedRef.current = false;
    pad.active = true; pad.x = 0; pad.y = 0; pad.mag = 0;
    setJoy({ id: e.pointerId, ax: e.clientX, ay: e.clientY, bx: e.clientX, by: e.clientY, dx: 0, dy: 0 });
  };
  const onZoneMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joy || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.bx;
    let dy = e.clientY - joy.by;
    const len = Math.hypot(dx, dy);
    let bx = joy.bx, by = joy.by;
    if (len > MAXR) {
      let nx = e.clientX - (dx / len) * MAXR;
      let ny = e.clientY - (dy / len) * MAXR;
      const adx = nx - joy.ax, ady = ny - joy.ay;
      const ad = Math.hypot(adx, ady);
      if (ad > LEASH) { nx = joy.ax + (adx / ad) * LEASH; ny = joy.ay + (ady / ad) * LEASH; }
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      nx = Math.min(Math.max(nx, r.left + 74), r.right - 74);
      ny = Math.min(Math.max(ny, r.top + 74), r.bottom - 74);
      dx = e.clientX - nx; dy = e.clientY - ny;
      const l2 = Math.hypot(dx, dy) || 1;
      dx = (dx / l2) * Math.min(l2, MAXR);
      dy = (dy / l2) * Math.min(l2, MAXR);
      bx = nx; by = ny;
    }
    pad.x = dx / MAXR; pad.y = dy / MAXR;
    pad.mag = Math.min(1, Math.hypot(dx, dy) / MAXR);
    if (len > MAXR && !maxedRef.current) { maxedRef.current = true; navigator.vibrate?.(6); }
    else if (len < MAXR * 0.85) maxedRef.current = false;
    setJoy({ ...joy, bx, by, dx, dy });
  };
  const onZoneUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joy || e.pointerId !== joy.id) return;
    pad.active = false; pad.x = 0; pad.y = 0; pad.mag = 0;
    setJoy(null);
  };

  /* ---------- flight stick (right) ---------- */
  const onZone2Down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joy2) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ok */ }
    setEverUsed2(true);
    maxed2Ref.current = false;
    pad2.active = true; pad2.x = 0; pad2.y = 0; pad2.mag = 0;
    setJoy2({ id: e.pointerId, ax: e.clientX, ay: e.clientY, bx: e.clientX, by: e.clientY, dx: 0, dy: 0 });
  };
  const onZone2Move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joy2 || e.pointerId !== joy2.id) return;
    let dx = e.clientX - joy2.bx;
    let dy = e.clientY - joy2.by;
    const len = Math.hypot(dx, dy);
    let bx = joy2.bx, by = joy2.by;
    if (len > MAXR2) {
      let nx = e.clientX - (dx / len) * MAXR2;
      let ny = e.clientY - (dy / len) * MAXR2;
      const adx = nx - joy2.ax, ady = ny - joy2.ay;
      const ad = Math.hypot(adx, ady);
      if (ad > LEASH2) { nx = joy2.ax + (adx / ad) * LEASH2; ny = joy2.ay + (ady / ad) * LEASH2; }
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      nx = Math.min(Math.max(nx, r.left + 68), r.right - 68);
      ny = Math.min(Math.max(ny, r.top + 68), r.bottom - 68);
      dx = e.clientX - nx; dy = e.clientY - ny;
      const l2 = Math.hypot(dx, dy) || 1;
      dx = (dx / l2) * Math.min(l2, MAXR2);
      dy = (dy / l2) * Math.min(l2, MAXR2);
      bx = nx; by = ny;
    }
    pad2.x = dx / MAXR2; pad2.y = dy / MAXR2;
    pad2.mag = Math.min(1, Math.hypot(dx, dy) / MAXR2);
    if (len > MAXR2 && !maxed2Ref.current) { maxed2Ref.current = true; navigator.vibrate?.(6); }
    setJoy2({ ...joy2, bx, by, dx, dy });
  };
  const onZone2Up = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joy2 || e.pointerId !== joy2.id) return;
    pad2.active = false; pad2.x = 0; pad2.y = 0; pad2.mag = 0;
    setJoy2(null);
  };

  const abilities = loadout.map((id) => abilityById(id)).filter(Boolean) as AbilityDef[];

  /* ---------- joystick visuals ---------- */
  const stick = (j: typeof joy, base: number, knob: number) => j && (
    <>
      <div className="joy-base" style={{ left: j.bx - base, top: j.by - base, width: base * 2, height: base * 2 }} />
      <div className="joy-ring" style={{ left: j.ax - base * 1.35, top: j.ay - base * 1.35, width: base * 2.7, height: base * 2.7 }} />
      <div
        className="joy-knob"
        style={{ left: j.bx + j.dx - knob, top: j.by + j.dy - knob, width: knob * 2, height: knob * 2 }}
      />
    </>
  );

  return (
    <>
      {/* ---------- move stick zone (left half) ---------- */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-[44%] portrait:w-[52%]"
        style={{ touchAction: "none" }}
        onPointerDown={onZoneDown}
        onPointerMove={onZoneMove}
        onPointerUp={onZoneUp}
        onPointerCancel={onZoneUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!everUsed && !joy && (
          <div className="pointer-events-none absolute left-[12%] top-[38%] -translate-x-1/2 text-center">
            <div className="joy-base opacity-70" style={{ left: -60, top: -60, width: 120, height: 120 }} />
            <div className="mt-[76px] font-hud text-[10px] tracking-widest text-white/45">حرکت</div>
          </div>
        )}
        {stick(joy, 60, 27)}
      </div>

      {/* ---------- FLIGHT PAD: the entire right half of the screen ----------
          No button, no stick graphic — touch anywhere and drag:
          up = climb · down = dive · left/right = strafe.
          Only a subtle origin ring + direction chevron follows the finger. */}
      <div
        className="absolute right-0 top-0 z-10 h-full w-[56%] portrait:w-[48%]"
        style={{ touchAction: "none" }}
        onPointerDown={onZone2Down}
        onPointerMove={onZone2Move}
        onPointerUp={onZone2Up}
        onPointerCancel={onZone2Up}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!everUsed2 && !joy2 && (
          <div className="flight-hint pointer-events-none absolute right-[8%] top-[32%] text-right font-hud text-[10px] leading-5 tracking-widest text-white/50">
            نیمهٔ راست صفحه
            <br />
            بالا · پایین · چپ · راست
          </div>
        )}
        {joy2 && (
          <>
            <div className="pad2-origin" style={{ left: joy2.ax - 17, top: joy2.ay - 17 }} />
            {Math.hypot(joy2.dx, joy2.dy) > 6 && (() => {
              const m = Math.hypot(joy2.dx, joy2.dy);
              const ang = (Math.atan2(joy2.dy, joy2.dx) * 180) / Math.PI;
              return (
                <div
                  className="pad2-arrow"
                  style={{
                    left: joy2.ax + (joy2.dx / m) * 46,
                    top: joy2.ay + (joy2.dy / m) * 46 - 7,
                    transform: `rotate(${ang}deg)`,
                  }}
                />
              );
            })()}
          </>
        )}
      </div>

      {/* ---------- ability cluster (bottom-right, thumb reach) ----------
          3×2 loadout grid with BRACE / OVERDRIVE above. The cluster sits on
          top of the flight pad: taps hit the buttons, everything around
          them is flight control. */}
      <div
        className="absolute bottom-[max(0.9rem,env(safe-area-inset-bottom))] right-2 z-20 origin-bottom-right"
        style={{ touchAction: "none", transform: `scale(${scale.c})` }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="mb-2 flex items-end justify-end gap-2.5">
          <button
            aria-label="Brace"
            className={`abtn h-[46px] w-[46px] ${braceOn ? "pressed" : ""}`}
            onPointerDown={(e) => {
              e.preventDefault(); e.stopPropagation();
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ok */ }
              touch.block = true; setBraceOn(true);
            }}
            onPointerUp={() => { touch.block = false; setBraceOn(false); }}
            onPointerCancel={() => { touch.block = false; setBraceOn(false); }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Shield size={20} strokeWidth={2.6} />
            <span className="pointer-events-none font-hud text-[7px] font-bold leading-none text-indigo-100/90">محافظ</span>
          </button>
          <button
            aria-label="Overdrive"
            className={`abtn h-[50px] w-[50px] ${odOn ? "pressed" : ""}`}
            onPointerDown={(e) => {
              e.preventDefault(); e.stopPropagation();
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ok */ }
              tap("over"); setOdOn(true);
            }}
            onPointerUp={() => setOdOn(false)}
            onPointerCancel={() => setOdOn(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <BatteryCharging size={22} strokeWidth={2.6} />
            <span className="pointer-events-none font-hud text-[7px] font-bold leading-none text-amber-100/90">اوج</span>
          </button>
        </div>
        <div className="grid grid-cols-3 gap-[10px]">
          {abilities.slice(0, 6).map((a) => (
            <AbilityBtn key={a.id} a={a} register={register} onHold={holdWrap} />
          ))}
        </div>
      </div>
    </>
  );
}
