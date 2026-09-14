import { useEffect, useRef } from "react";
import { Heart, Zap, Flame, Pause, Volume2, VolumeX, Skull, Trophy, Building2, Gauge, Swords, Shirt, Settings2, Rocket } from "lucide-react";
import type { Engine } from "../game3d/engine";
import { tap } from "../game/input";
import { settings } from "../game/settings";
import Minimap from "./Minimap";

export type PanelKind = "abilities" | "skins" | "settings";

export default function Hud({ game, muted, onToggleMute, onOpenPanel }: {
  game: Engine;
  muted: boolean;
  onToggleMute: () => void;
  onOpenPanel: (k: PanelKind) => void;
}) {
  const hpFill = useRef<HTMLDivElement>(null);
  const hpGhost = useRef<HTMLDivElement>(null);
  const enFill = useRef<HTMLDivElement>(null);
  const odFill = useRef<HTMLDivElement>(null);
  const odWrap = useRef<HTMLDivElement>(null);
  const hpTxt = useRef<HTMLSpanElement>(null);
  const scoreTxt = useRef<HTMLDivElement>(null);
  const waveTxt = useRef<HTMLSpanElement>(null);
  const killsTxt = useRef<HTMLSpanElement>(null);
  const demoTxt = useRef<HTMLSpanElement>(null);
  const altTxt = useRef<HTMLSpanElement>(null);
  const spdTxt = useRef<HTMLSpanElement>(null);
  const spdBar = useRef<HTMLDivElement>(null);
  const comboWrap = useRef<HTMLDivElement>(null);
  const comboNum = useRef<HTMLDivElement>(null);
  const bossWrap = useRef<HTMLDivElement>(null);
  const bossFill = useRef<HTMLDivElement>(null);
  const bossNameEl = useRef<HTMLDivElement>(null);
  const ageEl = useRef<HTMLDivElement>(null);
  const ageWrap = useRef<HTMLDivElement>(null);
  const msgEl = useRef<HTMLDivElement>(null);
  const zoneEl = useRef<HTMLDivElement>(null);
  const planetEl = useRef<HTMLDivElement>(null);
  const fpsEl = useRef<HTMLSpanElement>(null);
  const ageBar = useRef<HTMLDivElement>(null);
  const st = useRef({ ghost: 1, combo: 0, msg: "" });

  useEffect(() => {
    let raf = 0;
    const s = st.current;
    const tick = () => {
      const hud = game.hud;
      const hp = Math.max(0, Math.min(1, hud.hp / hud.maxHp));
      const en = Math.max(0, Math.min(1, hud.en / hud.maxEn));
      s.ghost += (hp - s.ghost) * 0.06;
      if (s.ghost < hp) s.ghost = hp;

      if (hpFill.current) {
        hpFill.current.style.transform = `scaleX(${hp})`;
        hpFill.current.style.background =
          hp > 0.55 ? "linear-gradient(90deg,#ff5f4d,#ff2b3a)"
            : hp > 0.28 ? "linear-gradient(90deg,#ffb054,#ff7a3c)"
              : "linear-gradient(90deg,#ff2b3a,#ff7a9e)";
      }
      if (hpGhost.current) hpGhost.current.style.transform = `scaleX(${s.ghost})`;
      if (enFill.current) enFill.current.style.transform = `scaleX(${en})`;
      if (odFill.current) odFill.current.style.transform = `scaleX(${Math.max(0, Math.min(1, hud.od / 100))})`;
      if (odWrap.current) {
        odWrap.current.style.boxShadow = hud.od >= 100 || hud.odT > 0
          ? "inset 0 0 0 1px rgba(255,210,63,0.85), 0 0 14px rgba(255,180,40,0.6)" : "";
      }
      if (hpTxt.current) hpTxt.current.textContent = `${Math.ceil(hud.hp)}`;
      if (scoreTxt.current) scoreTxt.current.textContent = hud.score.toLocaleString("en-US");
      if (waveTxt.current) waveTxt.current.textContent = `${hud.wave}`;
      if (killsTxt.current) killsTxt.current.textContent = `${hud.kills}`;
      if (demoTxt.current) demoTxt.current.textContent = `${hud.demolished}`;
      if (altTxt.current) altTxt.current.textContent = `${Math.round(hud.alt)}`;
      if (spdTxt.current) spdTxt.current.textContent = `${Math.round(hud.spd)}`;
      if (spdBar.current) spdBar.current.style.transform = `scaleX(${Math.min(1, hud.spd / 380)})`;

      if (comboWrap.current && comboNum.current) {
        const on = hud.combo >= 2;
        comboWrap.current.style.opacity = on ? "1" : "0";
        if (on) {
          if (hud.combo !== s.combo) {
            s.combo = hud.combo;
            comboNum.current.textContent = `×${hud.combo}`;
            comboNum.current.classList.remove("combo-pop");
            void comboNum.current.offsetWidth;
            comboNum.current.classList.add("combo-pop");
          }
          comboWrap.current.style.transform = `scale(${1 + Math.min(0.34, hud.combo * 0.008)})`;
        } else s.combo = 0;
      }

      if (bossWrap.current && bossFill.current) {
        bossWrap.current.style.opacity = hud.bossOn ? "1" : "0";
        if (hud.bossOn) {
          bossFill.current.style.transform = `scaleX(${Math.max(0, hud.bossHp / hud.bossMax)})`;
          if (bossNameEl.current && bossNameEl.current.textContent !== hud.bossName) {
            bossNameEl.current.textContent = hud.bossName;
          }
        }
      }
      if (ageWrap.current && ageEl.current) {
        const flash = hud.ageFlash > 0;
        ageWrap.current.style.opacity = flash ? "1" : "0.88";
        ageWrap.current.style.transform = flash ? "scale(1.14)" : "scale(1)";
        ageWrap.current.style.boxShadow = flash
          ? "inset 0 0 0 1px rgba(255,210,63,0.9), 0 0 20px rgba(255,180,40,0.7)" : "";
        ageEl.current.textContent = `سن ${hud.age} · قدرت ${hud.power}٪`;
      }
      if (ageBar.current) ageBar.current.style.transform = `scaleX(${Math.max(0, Math.min(1, hud.ageNext))})`;
      if (zoneEl.current) {
        zoneEl.current.style.opacity = hud.zoneOut ? "1" : "0";
        zoneEl.current.style.transform = hud.zoneOut ? "translate(-50%,0) scale(1)" : "translate(-50%,0) scale(0.85)";
      }
      if (planetEl.current) {
        planetEl.current.style.opacity = hud.planet ? "1" : "0";
        if (hud.planet && planetEl.current.textContent !== `◄ ${hud.planet} ►`) {
          planetEl.current.textContent = `◄ ${hud.planet} ►`;
        }
      }
      if (fpsEl.current) {
        fpsEl.current.textContent = `${hud.fps} FPS`;
        fpsEl.current.parentElement!.style.opacity = settings.get().showFps ? "1" : "0";
      }

      if (msgEl.current) {
        const show = hud.msgT > 0 && hud.msg.length > 0;
        msgEl.current.style.opacity = show ? "1" : "0";
        if (show && hud.msg !== s.msg) {
          s.msg = hud.msg;
          msgEl.current.textContent = hud.msg;
          msgEl.current.style.color = hud.msgKind === "warn" ? "#ff5f6e" : "#ffe9b8";
          msgEl.current.style.textShadow = hud.msgKind === "warn"
            ? "0 0 26px rgba(255,60,80,0.85), 0 2px 0 rgba(0,0,0,0.7)"
            : "0 0 26px rgba(255,180,80,0.55), 0 2px 0 rgba(0,0,0,0.7)";
          msgEl.current.animate(
            [
              { transform: "translate(-50%,-14px) scale(1.24)", opacity: 0, letterSpacing: "0.6em" },
              { transform: "translate(-50%,0) scale(1)", opacity: 1, letterSpacing: "0.2em" },
            ],
            { duration: 420, easing: "cubic-bezier(0.2,1.6,0.4,1)", fill: "forwards" },
          );
        } else if (!show) s.msg = "";
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-40">
        <div className="h-5 w-5 rounded-full border border-amber-200/70" />
        <div className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-200" />
      </div>

      {/* ---------- vitals ---------- */}
      <div className="absolute left-0 top-0 w-[min(300px,58vw)] p-3" style={{ paddingTop: "max(0.8rem, env(safe-area-inset-top))" }}>
        <div className="mb-1.5 flex items-center gap-2">
          <Heart size={15} className="shrink-0 text-[#ff5f6e] drop-shadow-[0_0_6px_rgba(255,43,58,0.8)]" fill="currentColor" />
          <div className="bar-shell bar-gloss h-[15px] flex-1">
            <div ref={hpGhost} className="bar-fill bg-[rgba(255,235,200,0.5)]" />
            <div ref={hpFill} className="bar-fill" />
            <div className="bar-ticks" />
          </div>
          <span ref={hpTxt} className="font-hud w-7 text-right text-sm font-bold text-rose-100 text-shadow">100</span>
        </div>
        <div className="mb-1.5 flex items-center gap-2 pl-[23px]">
          <div className="bar-shell bar-gloss h-[10px] w-[86%]">
            <div ref={enFill} className="bar-fill" style={{ background: "linear-gradient(90deg,#41b8ff,#6ecbff)" }} />
          </div>
          <Zap size={12} className="shrink-0 text-sky-300" fill="currentColor" />
        </div>
        <div className="flex items-center gap-2 pl-[23px]">
          <div ref={odWrap} className="bar-shell h-[7px] w-[86%] transition-shadow">
            <div ref={odFill} className="bar-fill" style={{ background: "linear-gradient(90deg,#ffd23f,#ff7a3c)" }} />
          </div>
          <Flame size={12} className="shrink-0 text-amber-300" fill="currentColor" />
        </div>

        <div ref={comboWrap} className="mt-3 origin-left opacity-0 transition-opacity duration-200">
          <div ref={comboNum} className="font-display text-4xl text-[#ffd23f] drop-shadow-[0_3px_0_rgba(122,16,32,0.9)]">×2</div>
          <div className="font-hud text-[11px] font-bold tracking-[0.42em] text-amber-100/80">COMBO</div>
        </div>
        <div className="mt-2">
          <Minimap game={game} size={112} />
        </div>
      </div>

      {/* zone warning */}
      <div
        ref={zoneEl}
        className="absolute left-1/2 top-[max(7.6rem,calc(env(safe-area-inset-top)+7.2rem))] -translate-x-1/2 scale-95 opacity-0 transition-all duration-300"
      >
        <div className="chip rounded-lg border border-rose-400/40 px-3 py-1.5" style={{ animation: "zonePulse 1.2s ease-in-out infinite" }}>
          <span className="font-hud text-[10px] font-bold tracking-[0.1em] text-rose-200">⚠ خارج از منطقهٔ نبرد — دشمنی دنبالت نمی‌آید</span>
        </div>
      </div>

      {/* planet label (space) */}
      <div ref={planetEl} className="absolute bottom-[max(0.9rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 opacity-0 transition-opacity duration-500">
        <div className="chip flex items-center gap-2 rounded-lg px-3 py-1.5">
          <Rocket size={12} className="text-violet-300" />
          <span className="font-hud text-[11px] font-bold tracking-[0.14em] text-violet-100" />
        </div>
      </div>

      {/* ---------- score / system ---------- */}
      <div className="absolute right-0 top-0 flex flex-col items-end gap-1.5 p-3" style={{ paddingTop: "max(0.8rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-1.5">
          <button
            onPointerDown={(e) => { e.stopPropagation(); onOpenPanel("abilities"); }}
            className="chip pointer-events-auto grid h-9 w-9 place-items-center rounded-lg text-sky-200 active:scale-90"
            aria-label="Abilities panel"
          >
            <Swords size={15} />
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onOpenPanel("skins"); }}
            className="chip pointer-events-auto grid h-9 w-9 place-items-center rounded-lg text-pink-200 active:scale-90"
            aria-label="Skins panel"
          >
            <Shirt size={15} />
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onOpenPanel("settings"); }}
            className="chip pointer-events-auto grid h-9 w-9 place-items-center rounded-lg text-emerald-200 active:scale-90"
            aria-label="Settings panel"
          >
            <Settings2 size={15} />
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); tap("pause"); }}
            className="chip pointer-events-auto grid h-9 w-9 place-items-center rounded-lg text-indigo-100 active:scale-90"
            aria-label="Pause"
          >
            <Pause size={16} />
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onToggleMute(); }}
            className="chip pointer-events-auto grid h-9 w-9 place-items-center rounded-lg text-indigo-100 active:scale-90"
            aria-label="Mute"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
        <div className="chip flex items-center gap-2 rounded-lg px-3 py-1.5">
          <Trophy size={14} className="text-[#ffd23f]" />
          <div ref={scoreTxt} className="font-hud text-xl font-bold leading-none text-amber-100">0</div>
        </div>
        <div className="flex gap-1.5">
          <div className="chip rounded-lg px-2.5 py-1">
            <span className="font-hud text-[10px] font-bold tracking-[0.2em] text-indigo-200/80">WAVE </span>
            <span ref={waveTxt} className="font-hud text-sm font-bold text-white">1</span>
          </div>
          <div className="chip flex items-center gap-1 rounded-lg px-2.5 py-1">
            <Skull size={11} className="text-rose-300" />
            <span ref={killsTxt} className="font-hud text-sm font-bold text-white">0</span>
          </div>
          <div className="chip flex items-center gap-1 rounded-lg px-2.5 py-1">
            <Building2 size={11} className="text-amber-300" />
            <span ref={demoTxt} className="font-hud text-sm font-bold text-white">0</span>
          </div>
        </div>
        <div ref={ageWrap} className="chip rounded-lg px-2.5 py-1 transition-all duration-300">
          <span ref={ageEl} className="font-hud text-[11px] font-bold tracking-[0.12em] text-emerald-200">سن 18 · قدرت 100٪</span>
          <div className="bar-shell mt-0.5 h-[3px] w-full">
            <div ref={ageBar} className="bar-fill origin-right" style={{ background: "linear-gradient(90deg,#41e8a0,#9fe8ff)" }} />
          </div>
        </div>
        <div className="chip rounded-lg px-2.5 py-1 opacity-0 transition-opacity">
          <span ref={fpsEl} className="font-hud text-[9px] font-bold text-emerald-200">60 FPS</span>
        </div>
      </div>

      {/* ---------- flight instruments ---------- */}
      <div className="absolute bottom-[max(0.9rem,env(safe-area-inset-bottom))] left-3 flex items-end gap-3">
        <div className="chip rounded-lg px-3 py-1.5">
          <div className="font-hud text-[9px] font-bold tracking-[0.3em] text-indigo-200/60">ALT</div>
          <div className="flex items-baseline gap-1">
            <span ref={altTxt} className="font-hud text-lg font-bold leading-none text-sky-200">0</span>
            <span className="font-hud text-[10px] text-indigo-200/60">m</span>
          </div>
        </div>
        <div className="chip rounded-lg px-3 py-1.5">
          <div className="flex items-center gap-1">
            <Gauge size={10} className="text-amber-300" />
            <span className="font-hud text-[9px] font-bold tracking-[0.3em] text-indigo-200/60">SPD</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span ref={spdTxt} className="font-hud text-lg font-bold leading-none text-amber-200">0</span>
            <span className="font-hud text-[10px] text-indigo-200/60">km/h</span>
          </div>
          <div className="bar-shell mt-1 h-[4px] w-[76px]">
            <div ref={spdBar} className="bar-fill" style={{ background: "linear-gradient(90deg,#ffd23f,#ff5a3c)" }} />
          </div>
        </div>
      </div>

      {/* ---------- boss bar ---------- */}
      <div
        ref={bossWrap}
        className="absolute left-1/2 top-[max(3.4rem,env(safe-area-inset-top))] w-[min(440px,74vw)] -translate-x-1/2 opacity-0 transition-opacity duration-500"
      >
        <div ref={bossNameEl} className="mb-1 text-center font-display text-sm tracking-[0.3em] text-[#ff8896] drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
          WARLORD
        </div>
        <div className="bar-shell bar-gloss h-[13px]">
          <div ref={bossFill} className="bar-fill" style={{ background: "linear-gradient(90deg,#ff2b3a,#ff7a5e)" }} />
          <div className="bar-ticks" />
        </div>
      </div>

      {/* ---------- center message ---------- */}
      <div
        ref={msgEl}
        className="absolute left-1/2 top-[20%] -translate-x-1/2 whitespace-nowrap text-center font-display text-[clamp(1rem,4.2vw,2.1rem)] tracking-[0.2em] opacity-0"
      />
    </div>
  );
}
