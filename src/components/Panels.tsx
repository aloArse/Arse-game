import { useEffect, useState } from "react";
import {
  X, Hand, Zap, Wind, ArrowDownToLine, Tornado, CloudLightning, Flame, Grab,
  Sparkles, Workflow, CircleDot, Rocket, Volume2, VolumeX, Gauge, RotateCcw,
  Monitor, Vibrate, Activity, Check,
} from "lucide-react";
import { ABILITIES, abilityById } from "../game/abilities";
import { SKINS } from "../game3d/character";
import { settings, type Quality } from "../game/settings";
import type { Engine } from "../game3d/engine";

/* ================================================================== */
/*  Shared modal shell — glassmorphism + animated aurora border        */
/* ================================================================== */
function Modal({ title, subtitle, onClose, children, accent = "#7aa8ff" }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3" dir="rtl">
      <div className="panel-backdrop absolute inset-0" onClick={onClose} />
      <div className="panel-shell relative w-full max-w-[430px] max-h-[86vh] flex flex-col overflow-hidden">
        <div className="panel-aurora" style={{ "--accent": accent } as React.CSSProperties} />
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <div>
            <div className="font-hud text-[15px] font-black tracking-wide text-white">{title}</div>
            {subtitle && <div className="text-[10px] text-white/50">{subtitle}</div>}
          </div>
          <button
            aria-label="Close panel"
            onClick={onClose}
            className="panel-close mr-auto"
          >
            <X size={16} strokeWidth={2.8} />
          </button>
        </div>
        <div className="overflow-y-auto px-3 pb-4">{children}</div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Abilities loadout panel                                            */
/* ================================================================== */
const ICONS: Record<string, typeof Hand> = {
  strike: Hand, blast: Zap, dash: Wind, slam: ArrowDownToLine,
  cyclone: Tornado, bolt: CloudLightning, vision: Flame, grab: Grab,
  meteor: Sparkles, chain: Workflow, bubble: CircleDot, missile: Rocket,
};

export function AbilitiesPanel({ game, loadout, onClose, onApply }: {
  game: Engine;
  loadout: string[];
  onClose: () => void;
  onApply: (ids: string[]) => void;
}) {
  const [sel, setSel] = useState<string[]>(loadout);
  const toggle = (id: string) => {
    setSel((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      if (s.length >= 6) return [...s.slice(0, 5), id];  // full → replace the last slot
      return [...s, id];
    });
  };
  const apply = () => {
    game.setLoadout(sel);
    settings.set({ loadout: sel });
    onApply(sel);
    onClose();
  };
  return (
    <Modal title="توانایی‌ها" subtitle={`${sel.length}/۶ جایگاه فعال — برای افزودن/حذف بزن`} onClose={onClose} accent="#7ae0ff">
      {/* active slots */}
      <div className="mb-3 grid grid-cols-6 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => {
          const a = abilityById(sel[i] ?? "");
          const Icon = a ? ICONS[a.id] : null;
          return (
            <div key={i} className={`slot-chip ${a ? "slot-filled" : ""}`}>
              {Icon ? <Icon size={16} strokeWidth={2.5} /> : <span className="text-[9px] text-white/25">خالی</span>}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ABILITIES.map((a) => {
          const on = sel.includes(a.id);
          const Icon = ICONS[a.id] ?? Hand;
          return (
            <button key={a.id} onClick={() => toggle(a.id)} className={`ability-card ${on ? "ability-on" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="ability-icon"><Icon size={17} strokeWidth={2.5} /></span>
                <span className="font-hud text-[12px] font-bold text-white">{a.fa}</span>
                {on && <Check size={13} className="mr-auto text-emerald-300" />}
              </div>
              <div className="mt-1 text-[9.5px] leading-4 text-white/60">{a.desc}</div>
              <div className="mt-1 flex gap-2 text-[8.5px] font-hud text-white/40">
                <span>⏱ {a.cd}s</span>
                {a.en > 0 && <span>⚡ {a.en}</span>}
              </div>
            </button>
          );
        })}
      </div>
      <button onClick={apply} className="panel-btn mt-3 w-full">ذخیرهٔ چیدمان</button>
    </Modal>
  );
}

/* ================================================================== */
/*  Skins panel                                                        */
/* ================================================================== */
export function SkinsPanel({ game, skin, onClose }: {
  game: Engine;
  skin: string;
  onClose: () => void;
}) {
  const [sel, setSel] = useState(skin);
  useEffect(() => {
    if (sel !== skin) {
      game.setSkin(sel);
      settings.set({ skin: sel });
    }
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title="اسکین قهرمان" subtitle="انتخاب کن — لحظه‌ای عوض می‌شود" onClose={onClose} accent="#ff9fd0">
      <div className="grid grid-cols-2 gap-2">
        {SKINS.map((sk) => {
          const on = sel === sk.id;
          return (
            <button key={sk.id} onClick={() => setSel(sk.id)} className={`skin-card ${on ? "skin-on" : ""}`}>
              <div className="flex items-center justify-center gap-1.5 py-1">
                <span className="swatch" style={{ background: `#${sk.pal.suit.toString(16).padStart(6, "0")}` }} />
                <span className="swatch" style={{ background: `#${sk.pal.accent.toString(16).padStart(6, "0")}` }} />
                <span className="swatch" style={{ background: `#${(sk.pal.cape ?? sk.pal.suitDark).toString(16).padStart(6, "0")}` }} />
              </div>
              <div className="font-hud text-[13px] font-black text-white">{sk.name}</div>
              <div className="text-[9.5px] leading-4 text-white/55">{sk.desc}</div>
              {on && <div className="skin-badge">فعال</div>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/* ================================================================== */
/*  Settings panel                                                     */
/* ================================================================== */
function Slider({ icon, label, value, onChange }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="set-row">
      <div className="flex items-center gap-2 text-white/80">
        {icon}
        <span className="text-[11px] font-bold">{label}</span>
        <span className="mr-auto font-hud text-[10px] text-white/45">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range" min={0} max={1} step={0.05} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="set-slider"
        style={{ "--fill": `${value * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}

export function SettingsPanel({ game, onClose, onToggleMute, muted }: {
  game: Engine;
  onClose: () => void;
  onToggleMute: () => void;
  muted: boolean;
}) {
  const [st, setSt] = useState(settings.get());
  useEffect(() => settings.subscribe(setSt), []);
  const patch = (p: Partial<typeof st>) => {
    settings.set(p);
    game.applySettings();
    setSt({ ...settings.get() });
  };
  return (
    <Modal title="تنظیمات" subtitle="صدا، گرافیک و حالت نمایش" onClose={onClose} accent="#9fe8a8">
      <div className="mb-2 font-hud text-[10px] tracking-widest text-white/40">صدا</div>
      <Slider icon={muted ? <VolumeX size={14} /> : <Volume2 size={14} />} label="صدای کل" value={st.master} onChange={(v) => patch({ master: v })} />
      <Slider icon={<Zap size={14} />} label="افکت‌های صوتی" value={st.sfx} onChange={(v) => patch({ sfx: v })} />
      <Slider icon={<Activity size={14} />} label="موسیقی" value={st.music} onChange={(v) => patch({ music: v })} />
      <button onClick={onToggleMute} className="panel-btn mt-1 w-full text-[11px]">
        {muted ? "🔊 روشن‌کردن صدا" : "🔇 قطع صدا"}
      </button>

      <div className="mb-2 mt-4 font-hud text-[10px] tracking-widest text-white/40">گرافیک</div>
      <div className="grid grid-cols-3 gap-1.5">
        {([["low", "کم"], ["medium", "متوسط"], ["high", "بالا"]] as [Quality, string][]).map(([q, fa]) => (
          <button key={q} onClick={() => patch({ quality: q })}
            className={`quality-btn ${st.quality === q ? "quality-on" : ""}`}>
            <Monitor size={13} />
            <span className="text-[10px] font-bold">{fa}</span>
          </button>
        ))}
      </div>

      <div className="mb-2 mt-4 font-hud text-[10px] tracking-widest text-white/40">حالت نمایش</div>
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => patch({ shake: !st.shake })} className={`quality-btn ${st.shake ? "quality-on" : ""}`}>
          <Vibrate size={13} /><span className="text-[10px] font-bold">لرزش دوربین</span>
        </button>
        <button onClick={() => patch({ showFps: !st.showFps })} className={`quality-btn ${st.showFps ? "quality-on" : ""}`}>
          <Gauge size={13} /><span className="text-[10px] font-bold">نمایش FPS</span>
        </button>
      </div>

      <button
        onClick={() => { settings.reset(); game.applySettings(); setSt({ ...settings.get() }); }}
        className="panel-btn mt-4 w-full text-[11px]"
      >
        <span className="inline-flex items-center gap-1.5"><RotateCcw size={12} /> بازنشانی تنظیمات</span>
      </button>
    </Modal>
  );
}
