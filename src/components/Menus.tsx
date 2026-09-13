import { useState } from "react";
import {
  Play, Volume2, VolumeX, X, Home, RotateCcw, Hand, Zap, Wind, Orbit, Flame,
  Move, Shield, Trophy, Skull, Target, Timer, HelpCircle, Building2, ChevronsUpDown, Grab,
} from "lucide-react";
import type { RunStats } from "../game/types";

/* ---------- shared bits ---------- */

function PrimaryBtn({ label, onClick, icon }: { label: string; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="group relative inline-flex items-center gap-3 overflow-hidden bg-gradient-to-b from-[#ffe27a] via-[#ffd23f] to-[#f7931e] px-8 py-3.5 font-display text-lg tracking-[0.14em] text-[#241003] transition-transform duration-100 [clip-path:polygon(10px_0,100%_0,calc(100%-10px)_100%,0_100%)] hover:brightness-110 active:scale-95"
      style={{ boxShadow: "0 6px 0 #7a2e10, 0 14px 34px rgba(255,150,50,0.4)" }}
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
      {icon}
      {label}
    </button>
  );
}

function GhostBtn({ label, onClick, icon }: { label: string; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2.5 border border-indigo-300/30 bg-[#0d1430]/70 px-6 py-3 font-display text-sm tracking-[0.18em] text-indigo-100 backdrop-blur-sm transition-all [clip-path:polygon(8px_0,100%_0,calc(100%-8px)_100%,0_100%)] hover:border-[#ffd23f]/70 hover:text-[#ffd23f] active:scale-95"
    >
      {icon}
      {label}
    </button>
  );
}

function HazardStrip() {
  return <div className="hazard h-2 w-full opacity-90" />;
}

/* ---------- main menu ---------- */

export function MainMenu({ onStart, muted, onToggleMute }: {
  onStart: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const [howTo, setHowTo] = useState(false);
  return (
    <div className="absolute inset-0 z-20 flex flex-col">
      {/* soft readability gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#05070f]/80 via-transparent to-[#05070f]/85" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6">
        <div className="rise-in relative mb-2 flex items-center gap-3">
          <span className="h-[2px] w-10 bg-[#ffd23f]" />
          <span className="font-hud text-[11px] font-bold tracking-[0.5em] text-indigo-100/85 sm:text-xs">
            EARTH-DEFENSE PROTOCOL · ARC 07
          </span>
          <span className="h-[2px] w-10 bg-[#ffd23f]" />
        </div>

        <h1 className="rise-in rise-in-d1 title-hero floaty text-center font-display text-[clamp(3.4rem,14vw,9.5rem)] leading-[0.92]">
          INVINCIBLE
        </h1>
        <div className="rise-in rise-in-d2 blood-bar mt-1 mb-6 bg-[#ff2b3a] px-5 py-1 [clip-path:polygon(6px_0,100%_0,calc(100%-6px)_100%,0_100%)]">
          <span className="relative z-10 font-display text-[clamp(0.8rem,3vw,1.4rem)] tracking-[0.55em] text-white">
            SKY GUARDIAN
          </span>
        </div>

        <p className="rise-in rise-in-d2 mb-8 max-w-lg text-center font-hud text-sm font-semibold leading-relaxed text-indigo-100/75">
          A Flaxan armada is shredding the skyline and a Viltrumite warlord is inbound.
          Fly at supersonic speed, punch through skyscrapers, and level whole blocks —
          collateral damage is part of the job.
        </p>

        <div className="rise-in rise-in-d3 flex flex-wrap items-center justify-center gap-4">
          <PrimaryBtn label="START MISSION" onClick={onStart} icon={<Play size={20} strokeWidth={2.6} fill="currentColor" />} />
          <GhostBtn label="HOW TO PLAY" onClick={() => setHowTo(true)} icon={<HelpCircle size={17} />} />
          <button
            onClick={onToggleMute}
            className="chip grid h-11 w-11 place-items-center rounded-xl text-indigo-100 transition-colors hover:text-[#ffd23f] active:scale-90"
            aria-label="Toggle sound"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        <div className="rise-in rise-in-d3 mt-10 hidden flex-wrap items-center justify-center gap-x-5 gap-y-2 font-hud text-[11px] font-bold tracking-[0.24em] text-indigo-200/60 md:flex">
          <span className="flex items-center gap-1.5"><Move size={13} /> WASD — FLY</span>
          <span className="h-3 w-px bg-indigo-200/25" />
          <span>SPACE / C — UP · DOWN</span>
          <span className="h-3 w-px bg-indigo-200/25" />
          <span>J — STRIKE (HOLD = FLURRY)</span>
          <span className="h-3 w-px bg-indigo-200/25" />
          <span>K — BLAST</span>
          <span className="h-3 w-px bg-indigo-200/25" />
          <span>SHIFT — DASH</span>
          <span className="h-3 w-px bg-indigo-200/25" />
          <span>L — SLAM / PILE-DRIVE</span>
          <span className="h-3 w-px bg-indigo-200/25" />
          <span>H — CYCLONE</span>
          <span className="h-3 w-px bg-indigo-200/25" />
          <span>B — BRACE</span>
          <span className="h-3 w-px bg-indigo-200/25" />
          <span>G — GRAB / CLAP</span>
        </div>
        <div className="rise-in rise-in-d3 mt-10 flex items-center gap-3 font-hud text-[11px] font-bold tracking-[0.24em] text-indigo-200/60 md:hidden">
          <span className="flex items-center gap-1.5"><Move size={13} /> LEFT THUMB — FLY</span>
          <span className="h-3 w-px bg-indigo-200/25" />
          <span>RIGHT THUMB — ABILITIES</span>
        </div>
      </div>

      <div className="relative">
        <HazardStrip />
        <div className="flex items-center justify-between bg-[#05070f] px-4 py-2">
          <span className="font-hud text-[10px] font-semibold tracking-[0.3em] text-indigo-200/40">
            UNOFFICIAL FAN TRIBUTE — RENDERED ENTIRELY IN CODE
          </span>
          <span className="font-hud text-[10px] font-semibold tracking-[0.3em] text-indigo-200/40">v1.0</span>
        </div>
      </div>

      {howTo && <HowTo onClose={() => setHowTo(false)} />}
    </div>
  );
}

/* ---------- how to play ---------- */

function Row({ icon, keyCap, title, desc }: { icon: React.ReactNode; keyCap: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[#0d1430]/70 p-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#1a244d] text-[#ffd23f]">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-hud text-sm font-bold text-white">{title}</span>
          <span className="rounded bg-[#05070f] px-1.5 py-0.5 font-hud text-[10px] font-bold tracking-wider text-[#ffd23f]">{keyCap}</span>
        </div>
        <p className="mt-0.5 font-hud text-xs leading-snug text-indigo-100/65">{desc}</p>
      </div>
    </div>
  );
}

export function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#05070f]/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="rise-in w-[min(560px,94vw)] max-h-[88vh] overflow-y-auto rounded-2xl border border-indigo-300/20 bg-gradient-to-b from-[#111a3c] to-[#0a0f26] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl tracking-[0.12em] text-[#ffd23f]">FIELD MANUAL</h2>
          <button onClick={onClose} className="chip grid h-9 w-9 place-items-center rounded-lg text-indigo-100 active:scale-90" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-2.5">
          <Row icon={<Move size={20} />} keyCap="L-STICK / WASD" title="FLIGHT"
            desc="True 3D momentum flight, relative to the camera. The stick base drifts with your thumb so you never run out of throw — hold the gate to spool up the afterburner." />
          <Row icon={<ChevronsUpDown size={20} />} keyCap="SPACE / C" title="ALTITUDE"
            desc="Climb above the cloud deck or dive between towers. The two thruster buttons on the right pad control vertical lift." />
          <Row icon={<Hand size={20} />} keyCap="J (TAP / HOLD)" title="STRIKE CHAIN → FLURRY"
            desc="Jab → cross → launching UPPERCUT, each with real wind-up and follow-through. Keep J HELD near a target and it becomes a FLURRY — a magnetized rapid-fire barrage that drags you onto the victim." />
          <Row icon={<Wind size={20} />} keyCap="SHIFT + J" title="DASH-CANCEL PUNCH"
            desc="Strike during a Sonic Dash to convert it into a heavy momentum punch that launches anything it touches. Dashes can also be steered mid-flight." />
          <Row icon={<Grab size={20} />} keyCap="G" title="GRAB & THROW"
            desc="Snatch an enemy out of the air and hurl them like a missile — they wreck whatever they hit. With no target in range the same button fires a THUNDER CLAP airburst." />
          <Row icon={<Orbit size={20} />} keyCap="L (WITH VICTIM)" title="PILE-DRIVER"
            desc="Grab an enemy (G), then press SLAM — rocket skyward with them pinned below you and drive them into the pavement for massive damage plus a shockwave." />
          <Row icon={<Zap size={20} />} keyCap="K (HOLD)" title="PLASMA BOLTS"
            desc="Hold to rapid-fire homing energy bolts. They punch craters in concrete too. Overdrive fires twin bolts." />
          <Row icon={<Wind size={20} />} keyCap="SHIFT" title="SONIC DASH"
            desc="A burst of invulnerable supersonic speed that drills a tunnel straight through any building in the way." />
          <Row icon={<Orbit size={20} />} keyCap="L" title="NOVA SLAM"
            desc="Rocket up, then pile-drive the ground. The shockwave flattens every structure in a huge radius." />
          <Row icon={<Flame size={20} />} keyCap="H" title="CYCLONE SPIN"
            desc="An invulnerable whirling attack: everything orbiting you gets shredded and all incoming projectiles are batted back at their senders. Finishes with a launching shockwave." />
          <Row icon={<Shield size={20} />} keyCap="B (HOLD)" title="BRACE"
            desc="Cross your guard: incoming damage drops 78% and enemy bolts deflect straight back at the shooter. You can't attack while braced — it's for reading a bad situation." />
          <Row icon={<Flame size={20} />} keyCap="I" title="VILTRUMITE OVERDRIVE"
            desc="Fill the meter by fighting. Unleash for 8s of ×2 damage, more speed, twin bolts, bigger slams and halved incoming damage." />
          <Row icon={<Building2 size={20} />} keyCap="COLLATERAL" title="STRUCTURAL COLLAPSE"
            desc="Towers are stacks of individual floors that scorch and weaken under fire. Shear floors off and watch them fracture into concrete, rebar and glass — push a frame past critical and it groans, tilts, and pancakes floor-by-floor, leaving fires burning in the rubble." />
          <Row icon={<Shield size={20} />} keyCap="SURVIVE" title="THE ARMADA"
            desc="Drones snipe, seekers kamikaze, raptors slash past at full burn, gunships bombard, siege mechs charge heavy cannon and bombers flatten whole blocks unless you intercept them. Every 5th wave a Viltrumite warlord arrives — he flies, dash-punches and ground-slams whole blocks." />
        </div>

        <div className="mt-4"><HazardStrip /></div>
        <p className="mt-3 text-center font-hud text-[11px] font-semibold tracking-[0.2em] text-indigo-200/50">
          TIP — GREEN ORBS HEAL · BLUE ORBS RECHARGE
        </p>
      </div>
    </div>
  );
}

/* ---------- pause ---------- */

export function PauseMenu({ onResume, onRestart, onQuit, muted, onToggleMute }: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#05070f]/72 px-6 backdrop-blur-[6px]">
      <div className="rise-in mb-1 font-hud text-xs font-bold tracking-[0.5em] text-indigo-200/70">MISSION SUSPENDED</div>
      <h2 className="rise-in rise-in-d1 title-hero mb-8 font-display text-[clamp(2.6rem,9vw,5.5rem)] leading-none">PAUSED</h2>
      <div className="rise-in rise-in-d2 flex flex-wrap items-center justify-center gap-4">
        <PrimaryBtn label="RESUME" onClick={onResume} icon={<Play size={19} fill="currentColor" />} />
        <GhostBtn label="RESTART" onClick={onRestart} icon={<RotateCcw size={16} />} />
        <GhostBtn label="MAIN MENU" onClick={onQuit} icon={<Home size={16} />} />
        <button
          onClick={onToggleMute}
          className="chip grid h-11 w-11 place-items-center rounded-xl text-indigo-100 hover:text-[#ffd23f] active:scale-90"
          aria-label="Toggle sound"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
      <div className="rise-in rise-in-d3 mt-8 hidden flex-wrap justify-center gap-x-5 gap-y-2 font-hud text-[11px] font-bold tracking-[0.24em] text-indigo-200/55 md:flex">
        <span>WASD — FLY</span><span>SPACE / C — UP·DOWN</span><span>J — STRIKE (HOLD = FLURRY)</span>
        <span>K — BLAST</span><span>SHIFT — DASH</span><span>L — SLAM / PILE-DRIVE</span>
        <span>H — CYCLONE</span><span>B — BRACE</span><span>G — GRAB / CLAP</span><span>I — OVERDRIVE</span>
      </div>
    </div>
  );
}

/* ---------- game over ---------- */

export function GameOverMenu({ stats, onRetry, onQuit }: {
  stats: RunStats;
  onRetry: () => void;
  onQuit: () => void;
}) {
  const mm = Math.floor(stats.time / 60);
  const ss = Math.floor(stats.time % 60).toString().padStart(2, "0");
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#1a040c]/85 via-[#05070f]/88 to-[#05070f]/95 px-6">
      <div className="rise-in mb-1 font-hud text-xs font-bold tracking-[0.5em] text-rose-200/80">THE CITY STILL NEEDS A GUARDIAN</div>
      <h2 className="rise-in rise-in-d1 title-hero mb-2 text-center font-display text-[clamp(2.4rem,9vw,5.5rem)] leading-[0.95]">
        MISSION FAILED
      </h2>
      <div className="rise-in rise-in-d1 blood-bar mb-8 h-1.5 w-56 bg-[#ff2b3a]" />

      <div className="rise-in rise-in-d2 mb-8 text-center">
        <div className="font-hud text-[11px] font-bold tracking-[0.5em] text-indigo-200/70">FINAL SCORE</div>
        <div className="font-display text-[clamp(2.2rem,8vw,4.2rem)] leading-none text-[#ffd23f] drop-shadow-[0_4px_0_rgba(122,16,32,0.85)]">
          {stats.score.toLocaleString("en-US")}
        </div>
      </div>

      <div className="rise-in rise-in-d2 mb-9 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {[
          { icon: <Target size={16} />, label: "WAVE", value: `${stats.wave}` },
          { icon: <Skull size={16} />, label: "KILLS", value: `${stats.kills}` },
          { icon: <Building2 size={16} />, label: "LEVELED", value: `${stats.demolished}` },
          { icon: <Trophy size={16} />, label: "MAX COMBO", value: `×${stats.maxCombo}` },
          { icon: <Timer size={16} />, label: "SURVIVED", value: `${mm}:${ss}` },
        ].map((s) => (
          <div key={s.label} className="chip flex min-w-[110px] flex-col items-center gap-1 rounded-xl px-4 py-3">
            <span className="text-[#ffd23f]">{s.icon}</span>
            <span className="font-display text-xl text-white">{s.value}</span>
            <span className="font-hud text-[9px] font-bold tracking-[0.3em] text-indigo-200/60">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="rise-in rise-in-d3 flex flex-wrap items-center justify-center gap-4">
        <PrimaryBtn label="FLY AGAIN" onClick={onRetry} icon={<RotateCcw size={18} />} />
        <GhostBtn label="MAIN MENU" onClick={onQuit} icon={<Home size={16} />} />
      </div>
    </div>
  );
}
