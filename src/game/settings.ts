// ---------- Persistent game settings (localStorage-backed, pub/sub) ----------

export type Quality = "low" | "medium" | "high";

export interface Settings {
  master: number;      // 0..1
  sfx: number;         // 0..1
  music: number;       // 0..1
  quality: Quality;
  shake: boolean;      // camera shake
  showFps: boolean;
  loadout: string[];   // ability ids for the on-screen cluster (max 6)
  skin: string;        // active skin id
}

export const DEFAULT_LOADOUT = ["strike", "blast", "dash", "slam", "cyclone", "bolt"];

const DEFAULTS: Settings = {
  master: 0.85,
  sfx: 1,
  music: 0.55,
  quality: "high",
  shake: true,
  showFps: false,
  loadout: [...DEFAULT_LOADOUT],
  skin: "classic",
};

const KEY = "arse.settings.v1";

function clamp01(v: unknown, d: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(1, Math.max(0, n));
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Settings>;
    const q: Quality = p.quality === "low" || p.quality === "medium" || p.quality === "high" ? p.quality : "high";
    const loadout = Array.isArray(p.loadout)
      ? p.loadout.filter((x) => typeof x === "string").slice(0, 6)
      : [];
    return {
      master: clamp01(p.master, DEFAULTS.master),
      sfx: clamp01(p.sfx, DEFAULTS.sfx),
      music: clamp01(p.music, DEFAULTS.music),
      quality: q,
      shake: p.shake !== false,
      showFps: p.showFps === true,
      loadout: loadout.length ? loadout : [...DEFAULT_LOADOUT],
      skin: typeof p.skin === "string" ? p.skin : "classic",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

type Listener = (s: Settings) => void;

class SettingsStore {
  private s: Settings = typeof localStorage !== "undefined" ? load() : { ...DEFAULTS };
  private ls = new Set<Listener>();

  get(): Settings { return this.s; }

  set(patch: Partial<Settings>): void {
    this.s = { ...this.s, ...patch };
    if (this.s.loadout.length > 6) this.s.loadout = this.s.loadout.slice(0, 6);
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* private mode */ }
    for (const l of this.ls) l(this.s);
  }

  reset(): void { this.set({ ...DEFAULTS }); }

  subscribe(fn: Listener): () => void {
    this.ls.add(fn);
    return () => this.ls.delete(fn);
  }
}

export const settings = new SettingsStore();

/** quality → renderer tuning */
export function qualityProfile(q: Quality): {
  pixelRatio: number; bloom: boolean; particle: number; clouds: number; traffic: number; shadows: boolean;
} {
  switch (q) {
    case "low":
      return { pixelRatio: 1, bloom: false, particle: 0.45, clouds: 0.4, traffic: 0.35, shadows: false };
    case "medium":
      return { pixelRatio: 1.35, bloom: true, particle: 0.75, clouds: 0.7, traffic: 0.6, shadows: false };
    default:
      return { pixelRatio: 2, bloom: true, particle: 1, clouds: 1, traffic: 1, shadows: true };
  }
}
