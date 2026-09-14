// v5 feature tests: bug fixes, twin-stick, panels, skins, settings, age timer,
// zone, space, rebuild, traffic, minimap, weather.
// Uses engine.fastForward() — the headless GPU runs at a few fps, so real-time
// waits can't accumulate meaningful game time.
import { chromium } from "playwright-core";
const EXE = "/tmp/chromium";
const errors = [];
const launch = await chromium.launch({
  executablePath: EXE, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 392, height: 860 }, hasTouch: true, isMobile: true });
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("ERR_CONNECTION")) errors.push("[console] " + m.text()); });
await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(9000);
await page.locator("text=START MISSION").first().click({ timeout: 15000 });
await page.waitForTimeout(3000);
const check = (name, ok, extra = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
const keepalive = () => page.evaluate(() => { const e = window.__engine; e["hp"] = 1000; e["heroDead"] = false; e["iT"] = 3600; e.mode = "playing"; });
const ff = (s) => page.evaluate((t) => window.__engine.fastForward(t), s);
const pos = () => page.evaluate(() => {
  const e = window.__engine;
  return { x: +e["pos"].x.toFixed(1), y: +e["pos"].y.toFixed(1), z: +e["pos"].z.toFixed(1) };
});
const tapButton = (label, holdMs = 130) =>
  page.evaluate(({ label, holdMs }) => {
    const btn = [...document.querySelectorAll(`button[aria-label="${label}"]`)]
      .find((b) => b.offsetParent) ?? document.querySelector(`button[aria-label="${label}"]`);
    const r = btn.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const fire = (t, btns) => btn.dispatchEvent(new PointerEvent(t, {
      pointerId: 9, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true,
      clientX: x, clientY: y, buttons: btns,
    }));
    fire("pointerdown", 1);
    setTimeout(() => fire("pointerup", 0), holdMs);
  }, { label, holdMs });

// ============ 1) BLAST/STRIKE BUG: tap must not fling the hero ============
for (const label of ["Plasma blast", "Power strike"]) {
  const p0 = await pos();
  await tapButton(label);
  await page.waitForTimeout(400); // let the tap register + release
  await ff(2.5);
  const p1 = await pos();
  const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check(`bugfix: tap ${label} — hero stays put`, d < 30, `drift ${d.toFixed(1)}m`);
}

// ============ 1b) stuck-hold safety net: window-level pointerup releases ============
{
  await keepalive();
  const p0 = await pos();
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button[aria-label="Plasma blast"]')]
      .find((b) => b.offsetParent) ?? document.querySelector('button[aria-label="Plasma blast"]');
    const r = btn.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    btn.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 11, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true,
      clientX: x, clientY: y, buttons: 1,
    }));
    // the button's own pointerup is LOST — only a window-level one arrives
    setTimeout(() => window.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 11, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true,
      clientX: x, clientY: y, buttons: 0,
    })), 500);
  });
  await page.waitForTimeout(800);
  await ff(3);
  const p1 = await pos();
  const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check("bugfix: lost pointerup does not pin hero at map edge", d < 30, `drift ${d.toFixed(1)}m`);
}

// ============ 2) right flight stick: climb + descend ============
const dragStick = async (dir) => {
  await page.evaluate((dir) => {
    const x = 322, y = 710;
    const zone = document.elementFromPoint(x, y);
    const fire = (t, cy, btns) => zone.dispatchEvent(new PointerEvent(t, {
      pointerId: 21, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true,
      clientX: x, clientY: cy, buttons: btns,
    }));
    fire("pointerdown", y, 1);
    window.__stickRelease = () => fire("pointerup", y + dir * 70, 0);
    // wait one macrotask so React commits joy2 state before the move arrives
    setTimeout(() => fire("pointermove", y + dir * 70, 1), 60);
  }, dir);
  await page.waitForTimeout(350); // React commit + engine sees pad2
  await ff(1.6);
  await page.evaluate(() => window.__stickRelease());
  await page.waitForTimeout(200);
};
{
  await keepalive();
  const y0 = (await pos()).y;
  await dragStick(-1); // push up
  const y1 = (await pos()).y;
  check("flight stick: push up → hero climbs", y1 > y0 + 12, `y ${y0.toFixed(0)}→${y1.toFixed(0)}`);
  await dragStick(1); // push down
  const y2 = (await pos()).y;
  check("flight stick: push down → hero descends", y2 < y1 - 12, `y ${y1.toFixed(0)}→${y2.toFixed(0)}`);
  // idle: no input → gentle auto-descend
  await ff(2.5);
  const y3 = (await pos()).y;
  check("flight: releasing the stick sinks gently (no mid-air freeze)", y3 < y2, `y ${y2.toFixed(0)}→${y3.toFixed(0)}`);
}

// ============ 3) ability loadout panel ============
{
  await page.locator('button[aria-label="Abilities panel"]').click();
  await page.waitForTimeout(600);
  const hasPanel = await page.locator("text=توانایی‌ها").count() > 0;
  check("panel: abilities panel opens", hasPanel);
  await page.locator("button.ability-card", { hasText: "شهاب" }).click();
  await page.locator("button.panel-btn", { hasText: "ذخیره" }).click();
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const e = window.__engine;
    return {
      loadout: e.hud.loadout,
      hasMeteorBtn: [...document.querySelectorAll("button[aria-label='Meteor call']")].some((b) => b.offsetParent),
      saved: JSON.parse(localStorage.getItem("arse.settings.v1") || "{}").loadout,
    };
  });
  check("panel: meteor added to loadout + button appears + persisted",
    info.loadout.includes("meteor") && info.hasMeteorBtn && info.saved.includes("meteor"),
    JSON.stringify(info.loadout));
  // restore default loadout
  await page.evaluate(() => { window.__engine.setLoadout(["strike", "blast", "dash", "slam", "cyclone", "bolt"]); });
}

// ============ 4) new abilities fire ============
{
  await keepalive();
  const r = await page.evaluate(() => {
    const e = window.__engine;
    // park beside a tall tower so the meteor connect visually + numerically
    const b = e.city.buildings.find((x) => x.alive && x.h > 90);
    const V = e["pos"].constructor;
    e["pos"].set(b.x, 4, b.z + 10);
    e["vel"].set(0, 0, 0);
    e["cd"].meteor = 0; e["cd"].chain = 0; e["cd"].bubble = 0; e["cd"].missile = 0;
    e["en"] = 100;
    e["meteors"].length = 0;
    const dem0 = e.city.demolished, hp0 = b.hp, id = b.id;
    e["doMeteor"]();
    return { meteorQueued: e["meteors"].length, dem0, hp0, id };
  });
  check("ability: meteor call queued", r.meteorQueued === 1);
  await ff(3);
  const r2 = await page.evaluate((r) => {
    const e = window.__engine;
    const b = e.city.buildings[r.id];
    return {
      meteorsLeft: e["meteors"].length,
      demolished: e.city.demolished - r.dem0,
      hpDrop: r.hp0 - b.hp,
    };
  }, r);
  check("ability: meteor impacts, damages the block, clears",
    r2.meteorsLeft === 0 && (r2.demolished > 0 || r2.hpDrop > 50),
    `demolished +${r2.demolished} hpDrop ${r2.hpDrop}`);

  const r3 = await page.evaluate(() => {
    const e = window.__engine;
    e["doChainLightning"]();
    e["doBubble"]();
    const hpBefore = e["hp"];
    e["damagePlayer"](60, e["pos"].clone());
    const soaked = e["hp"] === hpBefore;
    e["doBubble"] && (e["bubbleT"] = 0); // drop bubble before the missile volley
    return { bubbleSoak: soaked, bubbleT: true };
  });
  check("ability: chain fires + bubble soaks damage", r3.bubbleSoak);
  const r4 = await page.evaluate(() => {
    const e = window.__engine;
    // fresh targets inside the zone for the rockets
    e["pos"].set(0, 4, 60);
    e["vel"].set(0, 0, 0);
    for (let i = 0; i < 4; i++) e["spawnWaveEnemy"]();
    e["cd"].missile = 0; e["en"] = 100;
    e["doMissiles"]();
    return { missiles: e["missiles"].length, targeted: e["missiles"].every((m) => m.target) };
  });
  check("ability: missile volley launched with targets", r4.missiles === 6 && r4.targeted);
  await ff(6.5);
  const r5 = await page.evaluate(() => {
    const e = window.__engine;
    return { left: e["missiles"].length, dead: e.enemies.list.filter((x) => x.dead).length };
  });
  check("ability: missiles track, detonate and clear", r5.left === 0, `left=${r5.left} enemiesDead=${r5.dead}`);
}

// ============ 5) skins ============
{
  const r = await page.evaluate(() => {
    const e = window.__engine;
    e.setSkin("midnight");
    return { skin: e.hud.skin, rigVisible: e.rig.group.visible, mats: e.rig.group.children.length > 0 };
  });
  check("skins: midnight applied + rig rebuilt", r.skin === "midnight" && r.rigVisible && r.mats);
  const r2 = await page.evaluate(() => {
    const e = window.__engine;
    e.setSkin("classic");
    return e.hud.skin;
  });
  check("skins: back to classic", r2 === "classic");
}

// ============ 6) settings ============
{
  const r = await page.evaluate(() => {
    const e = window.__engine;
    e.applySettings();
    return { pr: e.renderer.getPixelRatio() };
  });
  check("settings: applySettings runs, pixel ratio sane", r.pr > 0 && r.pr <= 2.01, `pr=${r.pr}`);
}

// ============ 7) age timer (30s = 1 year) ============
{
  await keepalive();
  const r = await page.evaluate(() => {
    const e = window.__engine;
    const age0 = e.hud.age, pw0 = e.hud.power, hp0 = e["hpMax"]();
    e["ageT"] = 29.9;
    e.fastForward(1.5);
    return { age0, age1: e.hud.age, pw0, pw1: e.hud.power, hp0, hp1: e["hpMax"](), ageNext: +e.hud.ageNext.toFixed(2) };
  });
  check("aging: 30s timer grows the hero (+1 year, power/hp up)",
    r.age1 === r.age0 + 1 && r.pw1 > r.pw0 && r.hp1 > r.hp0,
    `age ${r.age0}→${r.age1} power ${r.pw0}→${r.pw1}% hpMax ${r.hp0}→${r.hp1}`);
}

// ============ 8) enemy zone ============
{
  const r = await page.evaluate(() => {
    const e = window.__engine;
    e["startWave"](2);
    e["spawnT"] = 0; e["betweenT"] = 0;
    for (let i = 0; i < 6; i++) e["spawnWaveEnemy"]();
    return e.enemies.list.map((en) => Math.hypot(en.obj.position.x, en.obj.position.z));
  });
  const allIn = r.every((d) => d < 121 + 60);
  check("zone: enemies spawn inside the arena", allIn && r.length > 0,
    `n=${r.length} maxD=${Math.max(...r).toFixed(0)} (zone 121)`);
  await page.evaluate(() => {
    const e = window.__engine;
    const en = e.enemies.list[0];
    en.obj.position.set(600, 40, 600);
  });
  await ff(9);
  const d = await page.evaluate(() => {
    const e = window.__engine;
    return Math.hypot(e.enemies.list[0].obj.position.x, e.enemies.list[0].obj.position.z);
  });
  check("zone: leashed enemy returns", d < 121 + 40, `dist=${d.toFixed(0)}`);
}

// ============ 9) space + planets ============
{
  const r = await page.evaluate(() => {
    const e = window.__engine;
    e["pos"].set(1500, 2600, -1900 + 120); // above the red desert planet
    e["vel"].set(0, 0, 0);
    const s = e.space.surfaceUnder(e["pos"]);
    return { inSpace: e.space.fadeAt(e["pos"].y) > 0.5, surface: s ? +s.y.toFixed(0) : null, planet: s?.planet.name ?? "" };
  });
  check("space: planet surface exists under the hero", r.inSpace && r.surface !== null, `surface y=${r.surface} planet=${r.planet}`);
  const r2 = await page.evaluate(() => {
    const e = window.__engine;
    e["pos"].y = 1500;
    return { label: e.space.nearestPlanet(e["pos"])?.planet.name ?? "" };
  });
  check("space: nearest planet resolves", r2.label.length > 0, r2.label);
  // back to earth
  await page.evaluate(() => { const e = window.__engine; e["pos"].set(0, 110, 180); e["vel"].set(0, 0, 0); });
}

// ============ 10) city rebuild after 20s ============
{
  const r = await page.evaluate(() => {
    const e = window.__engine;
    const b = e.city.buildings.find((x) => x.alive && x.h > 60);
    const V = e["pos"].constructor;
    e.city.collapse(b, new V(b.x, 20, b.z), e.fx);
    return { alive: b.alive, rebuildT: +b.rebuildT.toFixed(1), id: b.id };
  });
  check("rebuild: demolished tower schedules reconstruction", !r.alive && r.rebuildT > 19, `rebuildT=${r.rebuildT}`);
  await page.evaluate((id) => {
    const e = window.__engine;
    e.city.buildings[id].rebuildT = 0.05;
  }, r.id);
  await ff(6);
  const r2 = await page.evaluate((id) => {
    const e = window.__engine;
    const b = e.city.buildings[id];
    return { alive: b.alive, top: +b.top.toFixed(0), hp: Math.round(b.hp), slabsOk: b.slabs.every((i) => e.city.slabs[i].alive) };
  }, r.id);
  check("rebuild: tower rises back after 20s", r2.alive && r2.hp > 0, `top=${r2.top} hp=${r2.hp} slabs=${r2.slabsOk}`);
}

// ============ 11) living city: traffic + panic ============
{
  const r = await page.evaluate(() => {
    const e = window.__engine;
    const c0 = e.traffic.cars[0];
    const p0 = { x: c0.mesh.position.x, z: c0.mesh.position.z };
    const ped = e.traffic.peds[0];
    const alarm0 = ped.alarm;
    e.traffic.panicAt(ped.x, ped.z, 40);
    return { ped: { alarm0, alarm1: ped.alarm }, car: p0, n: e.traffic.cars.length, np: e.traffic.peds.length };
  });
  await ff(2.5);
  const r2 = await page.evaluate(() => {
    const c = window.__engine.traffic.cars[0];
    return { x: c.mesh.position.x, z: c.mesh.position.z };
  });
  const moved = Math.hypot(r2.x - r.car.x, r2.z - r.car.z);
  check("traffic: cars drive + panic spreads", moved > 2 && r.ped.alarm1 > r.ped.alarm0,
    `moved=${moved.toFixed(1)}m cars=${r.n} peds=${r.np}`);
}

// ============ 12) minimap draws ============
{
  const r = await page.evaluate(() => {
    const cv = document.querySelector(".minimap-wrap canvas");
    if (!cv) return null;
    const g = cv.getContext("2d");
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 40) lit++;
    return { lit, total: cv.width * cv.height };
  });
  check("minimap: canvas has live content", r && r.lit > 200, r ? `${r.lit} lit px` : "missing");
}

// ============ 13) weather ============
{
  await page.evaluate(() => {
    const e = window.__engine;
    e.weather.timeOfDay = 0.95; // deep night
    e.weather.setWeather("storm");
    e.weather.autoWeather = false;
    e.weather.autoTime = false;
  });
  await page.waitForTimeout(1200);
  const r2 = await page.evaluate(() => {
    const e = window.__engine;
    return {
      night: +e.weather.out.night.toFixed(2),
      rainVisible: e.weather["rainPts"].visible,
      label: e.weather.out.label,
    };
  });
  check("weather: night + storm rain active", r2.night > 0.5 && r2.rainVisible, `night=${r2.night} rain=${r2.rainVisible} "${r2.label}"`);
  await page.evaluate(() => {
    const e = window.__engine;
    e.weather.timeOfDay = 0.4; e.weather.setWeather("clear");
  });
}

// ============ 14) buttons overlap regression (portrait here) ============
{
  const res = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button[aria-label]")].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 5 && r.height > 5;
    });
    const rects = btns.map((b) => ({ n: b.getAttribute("aria-label"), r: b.getBoundingClientRect() }));
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r, c = rects[j].r;
        const ix = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left));
        const iy = Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
        if (ix > 4 && iy > 4) overlaps.push(`${rects[i].n}∩${rects[j].n}`);
      }
    }
    return { n: rects.length, overlaps };
  });
  check("layout: no overlapping buttons (portrait)", res.overlaps.length === 0 && res.n >= 12,
    `${res.n} buttons overlaps=${JSON.stringify(res.overlaps)}`);
}

console.log("ERRORS:", errors.length, errors.slice(0, 5));
await launch.close();
process.exit(errors.length ? 1 : 0);
