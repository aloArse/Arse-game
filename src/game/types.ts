// ---------- Shared game state types (3D) ----------

export interface HudState {
  hp: number; maxHp: number;
  en: number; maxEn: number;
  od: number;            // overdrive charge 0..100
  odT: number;           // overdrive time remaining
  score: number;
  wave: number;
  combo: number;
  comboT: number;
  kills: number;
  demolished: number;    // buildings leveled
  bossOn: boolean;
  bossHp: number;
  bossMax: number;
  alt: number;           // altitude (m)
  spd: number;           // speed (km/h-ish)
  cds: { strike: number; blast: number; dash: number; slam: number; cyclone: number; bolt: number };
  cdMax: { strike: number; blast: number; dash: number; slam: number; cyclone: number; bolt: number };
  enCost: { blast: number; dash: number; slam: number; cyclone: number };
  blocking: boolean;     // hero is bracing
  flurry: boolean;       // hero is in barrage mode
  age: number;           // viltrumite age (years) — power grows with age
  power: number;         // derived power percentage (100 = base)
  ageFlash: number;      // >0 while the growth toast is showing
  bossName: string;      // active warlord name (boss bar)
  msg: string;
  msgT: number;
  msgKind: "info" | "warn";
  hurt: number;
  time: number;
}

export interface RunStats {
  score: number;
  wave: number;
  kills: number;
  maxCombo: number;
  demolished: number;
  time: number;
}

export function makeHud(): HudState {
  return {
    hp: 100, maxHp: 100, en: 100, maxEn: 100,
    od: 0, odT: 0, score: 0, wave: 0, combo: 0, comboT: 0,
    kills: 0, demolished: 0,
    bossOn: false, bossHp: 0, bossMax: 1,
    alt: 0, spd: 0,
    cds: { strike: 0, blast: 0, dash: 0, slam: 0, cyclone: 0, bolt: 0 },
    cdMax: { strike: 0.36, blast: 0.16, dash: 2.2, slam: 6.5, cyclone: 5.5, bolt: 9 },
    enCost: { blast: 4, dash: 12, slam: 32, cyclone: 18 },
    blocking: false, flurry: false,
    age: 18, power: 100, ageFlash: 0, bossName: "",
    msg: "", msgT: 0, msgKind: "info",
    hurt: 0, time: 0,
  };
}
