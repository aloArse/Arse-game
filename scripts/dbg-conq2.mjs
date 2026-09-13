import { chromium } from "playwright";
const launch = await chromium.launch({
  executablePath: "/tmp/chromium", headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 270 } });
page.on("console", (m) => { if (m.text().startsWith("[cq]")) console.log(m.text().slice(0, 150)); });
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 15000 });
await page.waitForTimeout(2000);

// same sequence as boss-test: KURGAN → THRAXA → CONQUEST, with per-frame logger
await page.evaluate(() => {
  const e = window.__engine;
  window.__rec = { states: new Set(), judged: 0, struck: 0, minionSpawns: 0 };
  const oj = e["addJudgement"].bind(e);
  e["addJudgement"] = (x, z, d) => { window.__rec.judged++; return oj(x, z, d); };
  const os = e["cityStrike"].bind(e);
  e["cityStrike"] = (x, z, r, d) => { window.__rec.struck++; return os(x, z, r, d); };
  const osm = e.enemies.spawn.bind(e.enemies);
  e.enemies.spawn = (k, p, h, bi) => {
    if (e.enemies.boss && !e.enemies.boss.dead && k === "drone") window.__rec.minionSpawns++;
    return osm(k, p, h, bi);
  };
  let last = "";
  const tick = () => {
    const b = e.enemies.boss;
    if (b && !b.dead) {
      const key = `${b.bossName}:${b.state}`;
      if (key !== last) { last = key; console.log(`[cq] ${key} t=${+e["t"].toFixed(1)}`); }
      window.__rec.states.add(key);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

for (const w of [5, 10, 15]) {
  await page.evaluate((wv) => {
    const e = window.__engine;
    for (const en of [...e.enemies.list]) e.enemies.remove(en);
    e["wave"] = wv;
    e["spawnAt"]("boss");
    e["hp"] = 1000; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing";
  }, w);
  await page.waitForTimeout(55000);
}
const fin = await page.evaluate(() => ({ ...window.__rec, states: [...window.__rec.states] }));
console.log("[cq] FINAL:", JSON.stringify(fin).slice(0, 400));
await launch.close();
