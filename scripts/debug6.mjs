import { chromium } from "playwright";
const EXE = "/tmp/chromium";
const errors = [];
const launch = await chromium.launch({
  executablePath: EXE, headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=angle"],
});
const page = await launch.newPage({ viewport: { width: 480, height: 270 } });
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
page.on("console", (m) => { if (m.text().startsWith("[dbg]")) console.log(m.text().slice(0, 300)); });

await page.goto("http://localhost:4173/", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(8000);
await page.locator("text=START MISSION").first().click({ timeout: 10000 });
await page.waitForTimeout(2000);

await page.evaluate(() => {
  const e = window.__engine;
  const orig = e.doGrabOrClap.bind(e);
  e.doGrabOrClap = () => {
    const list = e.enemies.list.filter((x) => !x.dead && !x.grabbed && x.thrown <= 0 && x.kind !== "boss" && x.kind !== "mech")
      .map((x) => `${x.kind}@${x.obj.position.distanceTo(e.rig.group.position).toFixed(1)}m`).join(",");
    console.log(`[dbg] doGrabOrClap candidates=[${list}] clapT=${e["clapT"].toFixed(2)} dead=${e["heroDead"]} iT=${e["iT"].toFixed(1)}`);
    return orig();
  };
});

// smoke3 exact flow: cyclone → brace → dash+punch → strike → spawn+G
await page.keyboard.press("KeyH");
await page.waitForTimeout(6000);
await page.keyboard.down("KeyB");
await page.waitForTimeout(4000);
await page.keyboard.up("KeyB");
await page.keyboard.down("ShiftLeft");
await page.waitForTimeout(600);
await page.keyboard.down("KeyJ");
await page.waitForTimeout(300);
await page.keyboard.up("KeyJ");
await page.keyboard.up("ShiftLeft");
await page.waitForTimeout(1500);
await page.keyboard.down("KeyJ");
await page.waitForTimeout(150);
await page.keyboard.up("KeyJ");

// poll like smoke3 does (cd.strike>0), then spawn + G immediately
await page.waitForTimeout(600);

await page.evaluate(() => {
  const e = window.__engine;
  e["spawnAt"]("drone");
  const d = e.enemies.list[e.enemies.list.length - 1];
  const p = e.rig.group.position;
  d.obj.position.set(p.x + Math.sin(e.rig.group.rotation.y) * 4, p.y, p.z + Math.cos(e.rig.group.rotation.y) * 4);
});
await page.keyboard.press("KeyG");

// watch closely for 30s
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => {
    const e = window.__engine;
    return {
      grabbed: !!e["grabbed"], dead: e["heroDead"], hp: Math.round(e["hp"]),
      clapT: +e["clapT"].toFixed(2), msg: e.hud.msg.slice(0, 20),
      enemies: e.enemies.list.map((x) => `${x.kind}${x.dead ? "†" : ""}${x.grabbed ? "G" : ""}@${Math.round(x.obj.position.distanceTo(e.rig.group.position))}m`).join(" "),
    };
  });
  console.log("T+" + ((i + 1) * 2.5) + "s", JSON.stringify(st));
}
console.log("ERRORS:", errors.length);
await launch.close();
