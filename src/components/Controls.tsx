import { useEffect, useRef, useState } from "react";
import {
  Hand, Zap, Wind, Orbit, Flame, Move, ChevronUp, ChevronDown, Grab,
  Tornado, Shield, Eye, CloudLightning,
} from "lucide-react";
import type { Engine } from "../game3d/engine";
import { pad, touch, tap } from "../game/input";

type BtnName = "strike" | "blast" | "dash" | "slam" | "cyclone" | "bolt";
const CD_BTNS: BtnName[] = ["strike", "blast", "dash", "slam", "cyclone", "bolt"];

export default function Controls({ game }: { game: Engine }) {
  const [joy, setJoy] = useState<{ id: number; ax: number; ay: number; bx: number; by: number; dx: number; dy: number } | null>(null);
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const [everUsed, setEverUsed] = useState(false);

  const ovRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const odBtnRef = useRef<HTMLButtonElement>(null);
  const odRingRef = useRef<HTMLDivElement>(null);
  const blockBtnRef = useRef<HTMLButtonElement>(null);
  const strikeBtnRef = useRef<HTMLButtonElement>(null);
  const visionBtnRef = useRef<HTMLButtonElement>(null);
  const maxedRef = useRef(false);

  /* ---------- live cooldown painting (rAF, no react churn) ---------- */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const hud = game.hud;
      for (const b of CD_BTNS) {
        const ov = ovRefs.current[b];
        const el = btnRefs.current[b];
        if (!ov || !el) continue;
        const cd = hud.cds[b];
        const max = hud.cdMax[b] || 1;
        const k = Math.max(0, Math.min(1, cd / max));
        ov.style.background = k > 0.001
          ? `conic-gradient(transparent ${(1 - k) * 360}deg, rgba(4,7,18,0.8) 0deg)`
          : "none";
        ov.textContent = k > 0.03 && max > 0.5 ? cd.toFixed(1) : "";
        const cost =
          b === "blast" ? hud.enCost.blast :
            b === "dash" ? hud.enCost.dash :
              b === "slam" ? hud.enCost.slam :
                b === "cyclone" ? hud.enCost.cyclone : 0;
        const poor = cost > 0 && hud.en < cost;
        el.style.opacity = poor ? "0.42" : "1";
        el.style.filter = poor ? "saturate(0.35)" : "";
      }
      const od = odBtnRef.current;
      const ring = odRingRef.current;
      if (od && ring) {
        const ready = hud.od >= 100 && hud.odT <= 0;
        const active = hud.odT > 0;
        const deg = Math.max(0, Math.min(100, hud.od)) * 3.6;
        ring.style.background = `conic-gradient(${active ? "#ff5a3c" : "#ffd23f"} ${deg}deg, rgba(90,100,140,0.3) 0deg)`;
        od.classList.toggle("pulse-ready", ready);
        od.style.opacity = hud.od > 3 || active ? "1" : "0.4";
      }
      const blk = blockBtnRef.current;
      if (blk) {
        blk.style.filter = hud.blocking ? "brightness(1.6) saturate(1.4)" : "";
        blk.style.boxShadow = hud.blocking
          ? "inset 0 0 0 2px rgba(110,203,255,0.9), 0 0 22px rgba(110,203,255,0.55)" : "";
      }
      const strike = strikeBtnRef.current;
      if (strike) strike.style.filter = hud.flurry ? "brightness(1.5) saturate(1.3)" : "";
      const vis = visionBtnRef.current;
      if (vis) {
        const on = hud.en > 2;
        vis.style.filter = on ? "brightness(1.45) saturate(1.4)" : "";
        vis.style.boxShadow = on ? "inset 0 0 0 2px rgba(255,120,80,0.75), 0 0 16px rgba(255,120,80,0.4)" : "";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  useEffect(() => () => {
    pad.active = false;
    touch.blast = false; touch.strike = false; touch.up = false; touch.down = false; touch.block = false; touch.vision = false;
  }, []);

  /* ---------- floating joystick (leashed dynamic base) ---------- */
  const MAXR = 58;
  const LEASH = 84;

  const onZoneDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joy) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setEverUsed(true);
    maxedRef.current = false;
    pad.active = true;
    pad.x = 0; pad.y = 0; pad.mag = 0;
    setJoy({ id: e.pointerId, ax: e.clientX, ay: e.clientY, bx: e.clientX, by: e.clientY, dx: 0, dy: 0 });
  };
  const onZoneMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joy || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.bx;
    let dy = e.clientY - joy.by;
    const len = Math.hypot(dx, dy);
    let bx = joy.bx;
    let by = joy.by;
    if (len > MAXR) {
      let nx = e.clientX - (dx / len) * MAXR;
      let ny = e.clientY - (dy / len) * MAXR;
      const adx = nx - joy.ax, ady = ny - joy.ay;
      const ad = Math.hypot(adx, ady);
      if (ad > LEASH) {
        nx = joy.ax + (adx / ad) * LEASH;
        ny = joy.ay + (ady / ad) * LEASH;
      }
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      nx = Math.min(Math.max(nx, r.left + 74), r.right - 74);
      ny = Math.min(Math.max(ny, r.top + 74), r.bottom - 74);
      dx = e.clientX - nx;
      dy = e.clientY - ny;
      const l2 = Math.hypot(dx, dy) || 1;
      dx = (dx / l2) * Math.min(l2, MAXR);
      dy = (dy / l2) * Math.min(l2, MAXR);
      bx = nx; by = ny;
    }
    pad.x = dx / MAXR;
    pad.y = dy / MAXR;
    pad.mag = Math.min(1, Math.hypot(dx, dy) / MAXR);
    if (len > MAXR && !maxedRef.current) {
      maxedRef.current = true;
      navigator.vibrate?.(6);
    } else if (len < MAXR * 0.85) {
      maxedRef.current = false;
    }
    setJoy({ ...joy, bx, by, dx, dy });
  };
  const onZoneUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joy || e.pointerId !== joy.id) return;
    pad.active = false;
    pad.x = 0; pad.y = 0; pad.mag = 0;
    setJoy(null);
  };

  /* ---------- buttons ---------- */
  const bind = (name: BtnName | "over" | "up" | "down" | "grab" | "block" | "vision") => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setPressed((p) => ({ ...p, [name]: true }));
      if (name === "strike") { touch.strike = true; tap("strike"); }
      else if (name === "blast") touch.blast = true;
      else if (name === "up") touch.up = true;
      else if (name === "down") touch.down = true;
      else if (name === "block") touch.block = true;
      else if (name === "vision") touch.vision = true;
      else tap(name);
    },
    onPointerUp: () => release(name),
    onPointerCancel: () => release(name),
    onPointerLeave: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.buttons === 0) return;
      release(name);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const release = (name: string) => {
    setPressed((p) => ({ ...p, [name]: false }));
    if (name === "strike") touch.strike = false;
    if (name === "blast") touch.blast = false;
    if (name === "up") touch.up = false;
    if (name === "down") touch.down = false;
    if (name === "block") touch.block = false;
    if (name === "vision") touch.vision = false;
  };

  const hint = (t: string) => <span className="key-hint kbd-only">{t}</span>;
  const label = (t: string) => (
    <span className="pointer-events-none absolute -bottom-[13px] left-0 right-0 text-center font-hud text-[8.5px] font-bold tracking-[0.14em] text-indigo-100/85">
      {t}
    </span>
  );

  return (
    <>
      {/* ---------- joystick zone (left half) ---------- */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-[44%] portrait:w-[52%]"
        style={{ touchAction: "none" }}
        onPointerDown={onZoneDown}
        onPointerMove={onZoneMove}
        onPointerUp={onZoneUp}
        onPointerCancel={onZoneUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!joy && (
          <div
            className={`absolute bottom-[14%] left-[15%] flex flex-col items-center gap-2 transition-opacity duration-700 ${
              everUsed ? "opacity-0" : "opacity-60"
            }`}
          >
            <div className="joy-base relative h-[104px] w-[104px]">
              <Move className="absolute inset-0 m-auto text-indigo-200/70" size={30} />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <span
                  key={a}
                  className="absolute left-1/2 top-1/2 h-[7px] w-[2px] rounded bg-indigo-200/25"
                  style={{ transform: `rotate(${a}deg) translateY(-52px)`, transformOrigin: "0 0" }}
                />
              ))}
            </div>
            <span className="font-hud text-[11px] font-bold tracking-[0.3em] text-indigo-100/80">DRAG TO FLY</span>
            <span className="font-hud text-[10px] font-bold tracking-[0.2em] text-indigo-100/50">DIVE TO LAND · UP TO LAUNCH</span>
          </div>
        )}
        {joy && (() => {
          const len = Math.hypot(joy.dx, joy.dy);
          const mag = Math.min(1, len / MAXR);
          const ang = (Math.atan2(joy.dy, joy.dx) * 180) / Math.PI;
          const cruise = mag > 0.75;
          return (
            <>
              <div className="joy-base" style={{ left: joy.bx - 60, top: joy.by - 60, width: 120, height: 120 }} />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <span
                  key={a}
                  className="pointer-events-none absolute rounded"
                  style={{
                    left: joy.bx, top: joy.by,
                    width: 2, height: 7,
                    background: "rgba(160,185,255,0.3)",
                    transform: `rotate(${a}deg) translateY(-56px)`,
                    transformOrigin: "0 0",
                  }}
                />
              ))}
              <div
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: joy.bx - 60, top: joy.by - 60, width: 120, height: 120,
                  padding: 4,
                  background: `conic-gradient(from -90deg, ${cruise ? "#ff7a3c" : "#ffd23f"} ${mag * 360}deg, rgba(120,140,200,0.18) 0deg)`,
                  WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                  opacity: 0.5 + mag * 0.5,
                }}
              />
              {mag > 0.15 && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: joy.bx, top: joy.by, width: 0, height: 0,
                    transform: `rotate(${ang}deg)`,
                  }}
                >
                  <div
                    style={{
                      position: "absolute", left: 42, top: -5,
                      width: 0, height: 0,
                      borderTop: "5px solid transparent",
                      borderBottom: "5px solid transparent",
                      borderLeft: `12px solid rgba(255,210,63,${0.35 + mag * 0.6})`,
                    }}
                  />
                </div>
              )}
              <div
                className="joy-knob"
                style={{ left: joy.bx - 27 + joy.dx * 0.72, top: joy.by - 27 + joy.dy * 0.72, width: 54, height: 54 }}
              />
            </>
          );
        })()}
      </div>

      {/* ================= LANDSCAPE CLUSTER ================= */}
      <div
        className="absolute right-2 bottom-[max(0.9rem,env(safe-area-inset-bottom))] z-20 origin-bottom-right portrait:hidden max-[620px]:scale-[0.8] max-[420px]:scale-[0.66]"
        style={{ touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="relative h-[236px] w-[268px]">
          {/* altitude thrusters — left edge column */}
          <button
            {...bind("up")}
            aria-label="Ascend"
            className={`abtn absolute left-0 top-[64px] h-[54px] w-[54px] ${pressed.up ? "pressed" : ""}`}
          >
            <ChevronUp size={26} strokeWidth={3} />
            {label("UP")}
          </button>
          <button
            {...bind("down")}
            aria-label="Descend"
            className={`abtn absolute left-0 top-[132px] h-[54px] w-[54px] ${pressed.down ? "pressed" : ""}`}
          >
            <ChevronDown size={26} strokeWidth={3} />
            {label("DOWN")}
          </button>

          {/* overdrive */}
          <button
            ref={odBtnRef}
            {...bind("over")}
            aria-label="Overdrive"
            className="abtn absolute left-[74px] top-0 h-[52px] w-[52px] transition-opacity"
            style={{ opacity: 0.4 }}
          >
            <div
              ref={odRingRef}
              className="absolute inset-[-3px] rounded-full"
              style={{
                padding: 3,
                WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />
            <Flame size={22} className="drop-shadow-[0_0_6px_rgba(255,150,40,0.8)]" />
            {label("RAGE")}
            {hint("I")}
          </button>

          {/* grab */}
          <button
            {...bind("grab")}
            aria-label="Grab or thunder clap"
            className={`abtn absolute left-[140px] top-0 h-[52px] w-[52px] ${pressed.grab ? "pressed" : ""}`}
          >
            <Grab size={22} />
            {label("GRAB")}
            {hint("G")}
          </button>

          {/* vision (hold) */}
          <button
            ref={(r) => { visionBtnRef.current = r; }}
            {...bind("vision")}
            aria-label="Atomic vision"
            className={`abtn absolute left-[206px] top-0 h-[52px] w-[52px] ${pressed.vision ? "pressed" : ""}`}
          >
            <Eye size={22} className="text-orange-300" />
            {label("VISION")}
            {hint("V · HOLD")}
          </button>

          {/* thunder bolt */}
          <button
            ref={(r) => { btnRefs.current.bolt = r; }}
            {...bind("bolt")}
            aria-label="Thunder strike"
            className={`abtn absolute right-[84px] top-[2px] h-[54px] w-[54px] ${pressed.bolt ? "pressed" : ""}`}
          >
            <CloudLightning size={24} className="text-sky-200" />
            <div ref={(r) => { ovRefs.current.bolt = r; }} className="cd-sweep font-hud text-lg" />
            {label("BOLT")}
            {hint("T")}
          </button>

          {/* block */}
          <button
            ref={blockBtnRef}
            {...bind("block")}
            aria-label="Brace"
            className={`abtn absolute right-[8px] top-[76px] h-[58px] w-[58px] transition-all ${pressed.block ? "pressed" : ""}`}
          >
            <Shield size={24} className="text-sky-300" />
            {label("BRACE")}
          </button>

          {/* cyclone */}
          <button
            ref={(r) => { btnRefs.current.cyclone = r; }}
            {...bind("cyclone")}
            aria-label="Cyclone spin"
            className={`abtn absolute left-[78px] top-[64px] h-[60px] w-[60px] ${pressed.cyclone ? "pressed" : ""}`}
          >
            <Tornado size={25} className="text-amber-300" />
            <div ref={(r) => { ovRefs.current.cyclone = r; }} className="cd-sweep font-hud text-lg" />
            {label("CYCLONE")}
          </button>

          {/* slam */}
          <button
            ref={(r) => { btnRefs.current.slam = r; }}
            {...bind("slam")}
            aria-label="Nova slam, pile-driver or ground stomp"
            className={`abtn absolute right-[14px] top-[146px] h-[60px] w-[60px] ${pressed.slam ? "pressed" : ""}`}
          >
            <Orbit size={24} />
            <div ref={(r) => { ovRefs.current.slam = r; }} className="cd-sweep font-hud text-lg" />
            {label("SLAM")}
          </button>

          {/* blast */}
          <button
            ref={(r) => { btnRefs.current.blast = r; }}
            {...bind("blast")}
            aria-label="Plasma blast"
            className={`abtn absolute right-[92px] bottom-[26px] h-[62px] w-[62px] ${pressed.blast ? "pressed" : ""}`}
          >
            <Zap size={24} className="drop-shadow-[0_0_6px_rgba(255,210,63,0.7)]" />
            <div ref={(r) => { ovRefs.current.blast = r; }} className="cd-sweep font-hud text-lg" />
            {label("BLAST")}
          </button>

          {/* dash */}
          <button
            ref={(r) => { btnRefs.current.dash = r; }}
            {...bind("dash")}
            aria-label="Sonic dash"
            className={`abtn absolute left-[84px] bottom-[16px] h-[62px] w-[62px] ${pressed.dash ? "pressed" : ""}`}
          >
            <Wind size={25} />
            <div ref={(r) => { ovRefs.current.dash = r; }} className="cd-sweep font-hud text-lg" />
            {label("DASH")}
          </button>

          {/* strike */}
          <button
            ref={(r) => { btnRefs.current.strike = r; strikeBtnRef.current = r; }}
            {...bind("strike")}
            aria-label="Power strike"
            className={`abtn absolute right-[2px] bottom-[2px] h-[88px] w-[88px] ${pressed.strike ? "pressed" : ""}`}
            style={{
              background:
                "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.35), transparent 42%), linear-gradient(160deg, #ffd23f, #f7931e 65%, #d9432b)",
              boxShadow:
                "inset 0 0 0 2px rgba(255,255,255,0.4), inset 0 -10px 18px rgba(120,30,10,0.5), 0 8px 22px rgba(0,0,0,0.55), 0 0 24px rgba(255,160,50,0.35)",
              color: "#2b1503",
            }}
          >
            <Hand size={34} strokeWidth={2.4} />
            <div ref={(r) => { ovRefs.current.strike = r; }} className="cd-sweep font-hud text-xl" />
            {label("STRIKE")}
            {hint("J · HOLD = FLURRY")}
          </button>
        </div>
      </div>

      {/* ================= PORTRAIT CLUSTER ================= */}
      <div
        className="absolute right-2 bottom-[max(0.9rem,env(safe-area-inset-bottom))] z-20 hidden origin-bottom-right portrait:block max-[420px]:scale-[0.82]"
        style={{ touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="relative h-[430px] w-[218px]">
          {/* right column (bottom → top): STRIKE, BLAST, DASH, UP, DOWN */}
          <button
            {...bind("up")}
            aria-label="Ascend"
            className={`abtn absolute right-[6px] top-0 h-[52px] w-[52px] ${pressed.up ? "pressed" : ""}`}
          >
            <ChevronUp size={24} strokeWidth={3} />
            {label("UP")}
          </button>
          <button
            {...bind("down")}
            aria-label="Descend"
            className={`abtn absolute right-[6px] top-[62px] h-[52px] w-[52px] ${pressed.down ? "pressed" : ""}`}
          >
            <ChevronDown size={24} strokeWidth={3} />
            {label("DOWN")}
          </button>
          <button
            ref={(r) => { btnRefs.current.dash = r; }}
            {...bind("dash")}
            aria-label="Sonic dash"
            className={`abtn absolute right-[4px] top-[132px] h-[58px] w-[58px] ${pressed.dash ? "pressed" : ""}`}
          >
            <Wind size={24} />
            <div ref={(r) => { ovRefs.current.dash = r; }} className="cd-sweep font-hud text-lg" />
            {label("DASH")}
          </button>
          <button
            ref={(r) => { btnRefs.current.blast = r; }}
            {...bind("blast")}
            aria-label="Plasma blast"
            className={`abtn absolute right-[4px] top-[202px] h-[62px] w-[62px] ${pressed.blast ? "pressed" : ""}`}
          >
            <Zap size={24} className="drop-shadow-[0_0_6px_rgba(255,210,63,0.7)]" />
            <div ref={(r) => { ovRefs.current.blast = r; }} className="cd-sweep font-hud text-lg" />
            {label("BLAST")}
          </button>
          <button
            ref={(r) => { btnRefs.current.strike = r; strikeBtnRef.current = r; }}
            {...bind("strike")}
            aria-label="Power strike"
            className={`abtn absolute right-[2px] bottom-[2px] h-[92px] w-[92px] ${pressed.strike ? "pressed" : ""}`}
            style={{
              background:
                "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.35), transparent 42%), linear-gradient(160deg, #ffd23f, #f7931e 65%, #d9432b)",
              boxShadow:
                "inset 0 0 0 2px rgba(255,255,255,0.4), inset 0 -10px 18px rgba(120,30,10,0.5), 0 8px 22px rgba(0,0,0,0.55), 0 0 24px rgba(255,160,50,0.35)",
              color: "#2b1503",
            }}
          >
            <Hand size={36} strokeWidth={2.4} />
            <div ref={(r) => { ovRefs.current.strike = r; }} className="cd-sweep font-hud text-xl" />
            {label("STRIKE")}
          </button>

          {/* left column (bottom → top): SLAM, CYCLONE, GRAB, BOLT, VISION, RAGE, BRACE */}
          <button
            ref={(r) => { btnRefs.current.slam = r; }}
            {...bind("slam")}
            aria-label="Nova slam, pile-driver or ground stomp"
            className={`abtn absolute left-[104px] bottom-[8px] h-[60px] w-[60px] ${pressed.slam ? "pressed" : ""}`}
          >
            <Orbit size={23} />
            <div ref={(r) => { ovRefs.current.slam = r; }} className="cd-sweep font-hud text-lg" />
            {label("SLAM")}
          </button>
          <button
            ref={(r) => { btnRefs.current.cyclone = r; }}
            {...bind("cyclone")}
            aria-label="Cyclone spin"
            className={`abtn absolute left-[104px] bottom-[80px] h-[58px] w-[58px] ${pressed.cyclone ? "pressed" : ""}`}
          >
            <Tornado size={23} className="text-amber-300" />
            <div ref={(r) => { ovRefs.current.cyclone = r; }} className="cd-sweep font-hud text-lg" />
            {label("CYCLONE")}
          </button>
          <button
            {...bind("grab")}
            aria-label="Grab or thunder clap"
            className={`abtn absolute left-[104px] bottom-[150px] h-[54px] w-[54px] ${pressed.grab ? "pressed" : ""}`}
          >
            <Grab size={21} />
            {label("GRAB")}
          </button>
          <button
            ref={(r) => { btnRefs.current.bolt = r; }}
            {...bind("bolt")}
            aria-label="Thunder strike"
            className={`abtn absolute left-[104px] bottom-[216px] h-[54px] w-[54px] ${pressed.bolt ? "pressed" : ""}`}
          >
            <CloudLightning size={22} className="text-sky-200" />
            <div ref={(r) => { ovRefs.current.bolt = r; }} className="cd-sweep font-hud text-lg" />
            {label("BOLT")}
          </button>
          <button
            ref={(r) => { visionBtnRef.current = r; }}
            {...bind("vision")}
            aria-label="Atomic vision"
            className={`abtn absolute left-[104px] bottom-[282px] h-[54px] w-[54px] ${pressed.vision ? "pressed" : ""}`}
          >
            <Eye size={22} className="text-orange-300" />
            {label("VISION")}
          </button>
          <button
            ref={odBtnRef}
            {...bind("over")}
            aria-label="Overdrive"
            className="abtn absolute left-[104px] top-[6px] h-[50px] w-[50px] transition-opacity"
            style={{ opacity: 0.4 }}
          >
            <div
              ref={odRingRef}
              className="absolute inset-[-3px] rounded-full"
              style={{
                padding: 3,
                WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />
            <Flame size={21} className="drop-shadow-[0_0_6px_rgba(255,150,40,0.8)]" />
            {label("RAGE")}
          </button>
          <button
            ref={blockBtnRef}
            {...bind("block")}
            aria-label="Brace"
            className={`abtn absolute left-[104px] top-[68px] h-[54px] w-[54px] transition-all ${pressed.block ? "pressed" : ""}`}
          >
            <Shield size={22} className="text-sky-300" />
            {label("BRACE")}
          </button>
        </div>
      </div>
    </>
  );
}
