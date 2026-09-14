// ---------- Ability registry (engine + UI share this) ----------

export interface AbilityDef {
  id: string;
  name: string;        // english aria label
  fa: string;          // short persian button label
  icon: string;        // lucide icon name (mapped in UI)
  cd: number;          // cooldown seconds
  en: number;          // energy cost
  kind: "tap" | "hold";
  desc: string;        // persian description for the loadout panel
}

export const ABILITIES: AbilityDef[] = [
  { id: "strike",   name: "Power strike",   fa: "مشت",      icon: "Hand",      cd: 0.36, en: 0,  kind: "hold", desc: "کمبوی ۴ ضربه‌ای؛ ضربهٔ نهایی بک‌فست چرخشی است. نگه‌دار برای رگبار پیوسته." },
  { id: "blast",    name: "Plasma blast",   fa: "پلاسما",   icon: "Zap",       cd: 0.16, en: 4,  kind: "hold", desc: "شلیک پیوستهٔ گلوله‌های پلاسما؛ در حالت اوردرایو دوتایی می‌شود." },
  { id: "dash",     name: "Sonic dash",     fa: "دش",       icon: "Wind",      cd: 2.2,  en: 12, kind: "tap",  desc: "شتاب فراصوت — از داخل ساختمان‌ها رد می‌شوی و خرابشان می‌کنی." },
  { id: "slam",     name: "Nova slam",      fa: "نوا",      icon: "ArrowDownToLine", cd: 6.5, en: 32, kind: "tap", desc: "سقوط نوا از آسمان یا کوبیدن زمین؛ خرابی وسیع منطقه‌ای." },
  { id: "cyclone",  name: "Cyclone spin",   fa: "چرخش",     icon: "Tornado",   cd: 5.5,  en: 18, kind: "tap",  desc: "چرخش طوفانی با موج ضربهٔ تمام‌جهت." },
  { id: "bolt",     name: "Thunder strike", fa: "رعد",      icon: "CloudLightning", cd: 9, en: 0, kind: "tap", desc: "صاعقه از آسمان روی نقطهٔ هدف؛ آسیب سنگین ناحیه‌ای." },
  { id: "vision",   name: "Atomic vision",  fa: "چشم",      icon: "Flame",     cd: 0,    en: 0,  kind: "hold", desc: "نگه‌دار: بوم ذوب‌کننده از چشم‌ها." },
  { id: "grab",     name: "Grab or clap",   fa: "قیچ",      icon: "Grab",      cd: 1.1,  en: 0,  kind: "tap",  desc: "گرفتن دشمن و پرتش کردنش؛ بدون هدف، دست‌زدن صاعقه‌ای." },
  { id: "meteor",   name: "Meteor call",    fa: "شهاب",     icon: "Sparkles",  cd: 14,   en: 30, kind: "tap",  desc: "فراخواندن شهاب‌سنگ آتشین از آسمان روی نقطهٔ هدف." },
  { id: "chain",    name: "Chain lightning", fa: "زنجیر",   icon: "Workflow",  cd: 11,   en: 16, kind: "tap",  desc: "رعد زنجیره‌ای که بین ۵ دشمن می‌پرد." },
  { id: "bubble",   name: "Force bubble",   fa: "سپر",      icon: "CircleDot", cd: 18,   en: 26, kind: "tap",  desc: "حباب نیروی ۵ ثانیه‌ای: آسیب را می‌گیرد و دشمن‌ها را عقب می‌راند." },
  { id: "missile",  name: "Missile barrage", fa: "موشک",    icon: "Rocket",    cd: 12,   en: 22, kind: "tap",  desc: "شلیک ۶ موشک هدف‌گیر به سمت دشمن‌ها." },
];

export function abilityById(id: string): AbilityDef | undefined {
  return ABILITIES.find((a) => a.id === id);
}
