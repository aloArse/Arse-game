// ==================== Weather & sky system ====================
// Dynamic day/night cycle, volumetric-feel cloud banks, weather fronts
// (clear → scattered → overcast → storm with lightning + rain), sun & moon.
// Fully procedural — no textures loaded, mobile friendly.

import * as THREE from "three";

export type WeatherName = "clear" | "scattered" | "overcast" | "storm";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

interface SkyPalette {
  top: number; mid: number; bot: number; sunCol: number; haze: [number, number, number];
  sunI: number; ambI: number; fog: number; fogD: number; label: string;
}

/** keyframes of the day: 0 = midnight … 0.5 = noon */
const DAY: { t: number; p: SkyPalette }[] = [
  { t: 0.00, p: { top: 0x02030f, mid: 0x0a1030, bot: 0x1a2448, sunCol: 0x8fb0ff, haze: [0.05, 0.07, 0.16], sunI: 0.06, ambI: 0.34, fog: 0x141d3a, fogD: 0.0016, label: "شب" } },
  { t: 0.16, p: { top: 0x0b1038, mid: 0x35265e, bot: 0xff8b4a, sunCol: 0xffc98f, haze: [0.36, 0.15, 0.10], sunI: 0.55, ambI: 0.5, fog: 0x4a3a5c, fogD: 0.0018, label: "سپیده‌دم" } },
  { t: 0.25, p: { top: 0x1d3f8f, mid: 0x6f8fd8, bot: 0xffd9a3, sunCol: 0xfff0c8, haze: [0.30, 0.18, 0.10], sunI: 1.15, ambI: 0.72, fog: 0x8fa0c8, fogD: 0.0012, label: "طلوع" } },
  { t: 0.5,  p: { top: 0x1e63c8, mid: 0x63a4e8, bot: 0xcfe8ff, sunCol: 0xfff6dd, haze: [0.16, 0.18, 0.22], sunI: 1.45, ambI: 0.95, fog: 0xa8c4e4, fogD: 0.0008, label: "ظهر" } },
  { t: 0.72, p: { top: 0x1a4aa8, mid: 0x7f9de0, bot: 0xffe3b0, sunCol: 0xffecc4, haze: [0.24, 0.17, 0.10], sunI: 1.2, ambI: 0.82, fog: 0x9aadd0, fogD: 0.0010, label: "بعدازظهر" } },
  { t: 0.84, p: { top: 0x142058, mid: 0x8a4a9e, bot: 0xff9350, sunCol: 0xffb877, haze: [0.42, 0.19, 0.09], sunI: 0.7, ambI: 0.55, fog: 0x6a4a6e, fogD: 0.0016, label: "غروب" } },
  { t: 0.92, p: { top: 0x060a28, mid: 0x2a2050, bot: 0x6a3a58, sunCol: 0xd0a0c0, haze: [0.2, 0.1, 0.14], sunI: 0.16, ambI: 0.4, fog: 0x2c2a4e, fogD: 0.0018, label: "شفق" } },
  { t: 1.00, p: { top: 0x02030f, mid: 0x0a1030, bot: 0x1a2448, sunCol: 0x8fb0ff, haze: [0.05, 0.07, 0.16], sunI: 0.06, ambI: 0.34, fog: 0x141d3a, fogD: 0.0016, label: "شب" } },
];

/** how each weather front modifies the sky */
const FRONT: Record<WeatherName, { dim: number; desat: number; cloudOp: number; deckOp: number; rain: number; boltChance: number }> = {
  clear:     { dim: 1.0,  desat: 0.0,  cloudOp: 0.5,  deckOp: 0.55, rain: 0,    boltChance: 0 },
  scattered: { dim: 0.92, desat: 0.15, cloudOp: 0.85, deckOp: 0.8,  rain: 0,    boltChance: 0 },
  overcast:  { dim: 0.72, desat: 0.45, cloudOp: 1.0,  deckOp: 1.05, rain: 0.15, boltChance: 0 },
  storm:     { dim: 0.5,  desat: 0.62, cloudOp: 1.15, deckOp: 1.25, rain: 1,    boltChance: 1 },
};

function cloudPuffTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d")!;
  // many soft blobs → puffy cumulus silhouette
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 66;
    const x = 128 + Math.cos(a) * r * 1.25;
    const y = 128 + Math.sin(a) * r * 0.62 + 20;
    const rad = 30 + Math.random() * 46;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, "rgba(255,255,255,0.16)");
    gr.addColorStop(0.55, "rgba(255,255,255,0.075)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // bottom shading pass
  for (let i = 0; i < 12; i++) {
    const x = 40 + Math.random() * 176;
    const y = 150 + Math.random() * 50;
    const rad = 26 + Math.random() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, "rgba(120,110,140,0.10)");
    gr.addColorStop(1, "rgba(120,110,140,0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rainStreakTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 16; c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "rgba(190,215,255,0)");
  gr.addColorStop(0.5, "rgba(190,215,255,0.5)");
  gr.addColorStop(1, "rgba(190,215,255,0)");
  g.fillStyle = gr;
  g.fillRect(6, 0, 2.5, 128);
  return new THREE.CanvasTexture(c);
}

export class Weather {
  private group = new THREE.Group();
  private skyMat!: THREE.ShaderMaterial;
  private skyMesh!: THREE.Mesh;
  readonly sunDir = new THREE.Vector3(0, 0.3, -1).normalize();
  private decks: { m: THREE.Mesh; speed: number; baseY: number }[] = [];
  private banks: { s: THREE.Sprite; x: number; z: number; y: number; sc: number; ph: number }[] = [];
  private moon!: THREE.Sprite;
  private rainPts!: THREE.Points;
  private rainPos!: Float32Array;
  private rainVel: number[] = [];
  private rainMat!: THREE.PointsMaterial;

  /** 0..1 through the day; auto-advances */
  timeOfDay = 0.38;              // start late morning
  autoTime = true;
  dayLength = 260;               // seconds per full cycle
  weather: WeatherName = "scattered";
  private wBlend = 0;            // 0..1 transition into current front
  autoWeather = true;
  private weatherT = 40;         // seconds until next front roll

  private boltT = 0;
  private drift = 0;
  private flashT = 0;
  /** engine reads this to flash the scene when lightning strikes */
  lightningFlash = 0;

  /** current resolved palette (engine reads for lights/fog) */
  readonly out = {
    sunColor: new THREE.Color(0xffd9a0),
    sunI: 1, ambI: 0.7,
    fogColor: new THREE.Color(0x5a4a72),
    fogD: 0.0014,
    horizon: new THREE.Color(0xff9a5a),
    night: 0,                    // 0 day … 1 night
    label: "روز",
  };

  constructor(scene: THREE.Scene, quality: number) {
    this.build(quality);
    scene.add(this.group);
  }

  private build(quality: number): void {
    // ---- gradient sky dome ----
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x141a44) },
        mid: { value: new THREE.Color(0x6b4f8e) },
        bot: { value: new THREE.Color(0xff9a5a) },
        sunDir: { value: this.sunDir },
        sunCol: { value: new THREE.Color(0xffd9a0) },
        moonDir: { value: new THREE.Vector3(0, 0, 1) },
        night: { value: 0 },
        flash: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() {
          vW = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 moonDir;
        uniform float night; uniform float flash;
        varying vec3 vW;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vW);
          float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = mix(bot, mid, smoothstep(0.42, 0.56, h));
          c = mix(c, top, smoothstep(0.54, 0.96, h));
          // horizon haze
          float haze = exp(-abs(d.y) * 9.0);
          c += vec3(0.30, 0.15, 0.10) * haze * 0.5 * (1.0 - night * 0.7);
          // sun
          float s = max(0.0, dot(d, normalize(sunDir)));
          c += sunCol * smoothstep(0.9992, 0.9997, s) * 5.0;
          c += sunCol * pow(s, 340.0) * 3.4;
          c += sunCol * pow(s, 22.0) * 0.5;
          c += sunCol * pow(s, 7.0) * 0.26;
          // moon (visible at night)
          float mo = max(0.0, dot(d, normalize(moonDir)));
          float moonDisc = smoothstep(0.99955, 0.99985, mo);
          vec3 moonCol = vec3(0.86, 0.9, 1.0);
          c = mix(c, moonCol, moonDisc * night);
          c += moonCol * pow(mo, 220.0) * 0.8 * night;
          // stars
          float zen = smoothstep(0.12, 0.75, d.y);
          vec2 sp = d.xz / max(0.08, d.y + 0.35) * 46.0;
          vec2 cell = floor(sp);
          float star = step(0.9974, hash(cell));
          float tw = 0.5 + 0.5 * hash(cell + 7.0);
          c += vec3(0.9, 0.94, 1.0) * star * tw * zen * night * (0.9 + flash);
          // lightning wash
          c += vec3(0.75, 0.8, 1.0) * flash * (0.35 + 0.4 * haze);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 20), this.skyMat);
    this.skyMesh.frustumCulled = false;
    this.group.add(this.skyMesh);

    // ---- moon sprite (soft disc for a bit of texture) ----
    const mc = document.createElement("canvas");
    mc.width = mc.height = 128;
    const mg = mc.getContext("2d")!;
    const mgr = mg.createRadialGradient(64, 64, 0, 64, 64, 60);
    mgr.addColorStop(0, "rgba(235,240,255,1)");
    mgr.addColorStop(0.74, "rgba(220,228,248,0.95)");
    mgr.addColorStop(0.8, "rgba(180,190,220,0.35)");
    mgr.addColorStop(1, "rgba(160,175,215,0)");
    mg.fillStyle = mgr; mg.beginPath(); mg.arc(64, 64, 60, 0, Math.PI * 2); mg.fill();
    // craters
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 30;
      mg.fillStyle = "rgba(150,160,190,0.25)";
      mg.beginPath(); mg.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 3 + Math.random() * 7, 0, Math.PI * 2); mg.fill();
    }
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(mc), transparent: true, fog: false, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0,
    }));
    this.moon.scale.setScalar(190);
    this.group.add(this.moon);

    // ---- scrolling cloud decks (3 altitudes) ----
    const tex = cloudPuffTexture();
    for (let i = 0; i < 3; i++) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3 + i, 3 + i);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(5200, 5200),
        new THREE.MeshBasicMaterial({
          map: t, transparent: true, opacity: 0.4, depthWrite: false, fog: false,
          side: THREE.DoubleSide, color: 0xffffff,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = [230, 380, 560][i];
      m.renderOrder = -8 + i;
      this.group.add(m);
      this.decks.push({ m, speed: [2.2, 3.6, 5.2][i], baseY: m.position.y });
    }

    // ---- volumetric cloud banks: clusters of puffs at skyline altitude ----
    const bankTex = cloudPuffTexture();
    const nBanks = Math.round(26 * quality);
    for (let b = 0; b < nBanks; b++) {
      const puffs = 4 + Math.floor(Math.random() * 5);
      const cx = (Math.random() - 0.5) * 3400;
      const cz = (Math.random() - 0.5) * 3400;
      const cy = 200 + Math.random() * 420;
      const spread = 90 + Math.random() * 130;
      for (let p = 0; p < puffs; p++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: bankTex, transparent: true, depthWrite: false, fog: false,
          opacity: 0.32 + Math.random() * 0.2, rotation: Math.random() * Math.PI * 2,
        }));
        const sc = spread * (0.9 + Math.random() * 1.4);
        s.scale.set(sc, sc * 0.42, 1);
        s.position.set(cx + (Math.random() - 0.5) * spread * 2.4, cy + (Math.random() - 0.5) * 46, cz + (Math.random() - 0.5) * spread * 2.4);
        s.renderOrder = -4;
        this.group.add(s);
        this.banks.push({ s, x: s.position.x, z: s.position.z, y: s.position.y, sc, ph: Math.random() * 9 });
      }
    }

    // ---- rain (streak points recycled around the camera) ----
    const nRain = Math.round(900 * quality);
    this.rainPos = new Float32Array(nRain * 3);
    for (let i = 0; i < nRain; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 120;
      this.rainPos[i * 3 + 1] = Math.random() * 90;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
      this.rainVel.push(120 + Math.random() * 90);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.PointsMaterial({
      map: rainStreakTexture(), size: 7.5, transparent: true, opacity: 0,
      depthWrite: false, color: 0xbcd4ff, sizeAttenuation: true, fog: false,
      blending: THREE.AdditiveBlending,
    });
    this.rainPts = new THREE.Points(rg, this.rainMat);
    this.rainPts.frustumCulled = false;
    this.rainPts.visible = false;
    this.group.add(this.rainPts);
  }

  setWeather(w: WeatherName): void {
    if (w === this.weather) return;
    this.weather = w;
    this.wBlend = 0;
    this.weatherT = 60 + Math.random() * 90;
  }

  private rollWeather(): void {
    const r = Math.random();
    if (this.weather === "storm") {
      this.setWeather(r < 0.55 ? "overcast" : "scattered");
    } else if (this.weather === "overcast") {
      this.setWeather(r < 0.35 ? "storm" : r < 0.7 ? "scattered" : "clear");
    } else if (this.weather === "scattered") {
      this.setWeather(r < 0.3 ? "overcast" : r < 0.55 ? "clear" : "scattered");
    } else {
      this.setWeather(r < 0.4 ? "scattered" : r < 0.6 ? "overcast" : "clear");
    }
  }

  /** resolve the day palette into THREE.Colors */
  private resolve(t: number): void {
    let a = DAY[0], b = DAY[DAY.length - 1];
    for (let i = 0; i < DAY.length - 1; i++) {
      if (t >= DAY[i].t && t <= DAY[i + 1].t) { a = DAY[i]; b = DAY[i + 1]; break; }
    }
    const k = (t - a.t) / Math.max(1e-4, b.t - a.t);
    const f = FRONT[this.weather];
    const g = (x: number, y: number, target: THREE.Color): void => {
      target.set(x).lerp(new THREE.Color(y), k);
      // front dim + desaturate toward slate
      const slate = new THREE.Color(0x3c4356);
      target.lerp(slate, f.desat * 0.55).multiplyScalar(lerp(1, f.dim, 0.8));
    };
    g(a.p.top, b.p.top, this.skyMat.uniforms.top.value);
    g(a.p.mid, b.p.mid, this.skyMat.uniforms.mid.value);
    g(a.p.bot, b.p.bot, this.skyMat.uniforms.bot.value);
    g(a.p.sunCol, b.p.sunCol, this.skyMat.uniforms.sunCol.value);
    g(a.p.fog, b.p.fog, this.out.fogColor);
    g(a.p.bot, b.p.bot, this.out.horizon);
    this.out.sunI = lerp(a.p.sunI, b.p.sunI, k) * lerp(1, f.dim, 0.85);
    this.out.ambI = lerp(a.p.ambI, b.p.ambI, k) * lerp(1, f.dim, 0.5);
    this.out.fogD = lerp(a.p.fogD, b.p.fogD, k) * lerp(1, 1.5, f.desat);
    let night = 0;
    if (t >= 0.86 || t <= 0.05) night = 1;
    else if (t > 0.05 && t < 0.2) night = 1 - (t - 0.05) / 0.15;
    else if (t > 0.8 && t < 0.86) night = (t - 0.8) / 0.06;
    this.out.night = clamp(night, 0, 1);
    this.out.label = k < 0.5 ? a.p.label : b.p.label;
    this.skyMat.uniforms.night.value = this.out.night;
  }

  update(dt: number, camPos: THREE.Vector3, opts?: { spaceFade?: number; onLightning?: (i: number) => void }): void {
    // day cycle
    if (this.autoTime) this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1;
    // weather auto-roll
    if (this.autoWeather) {
      this.weatherT -= dt;
      if (this.weatherT <= 0) this.rollWeather();
    }
    if (this.wBlend < 1) this.wBlend = Math.min(1, this.wBlend + dt * 0.25);

    this.resolve(this.timeOfDay);
    const f = FRONT[this.weather];

    // ---- sun & moon direction ----
    const sa = this.timeOfDay * Math.PI * 2 - Math.PI / 2; // 0.25 → sunrise east
    this.sunDir.set(Math.cos(sa) * 0.9, Math.sin(sa), -0.35).normalize();
    this.skyMat.uniforms.sunDir.value.copy(this.sunDir);
    const moonDir = this.skyMat.uniforms.moonDir.value as THREE.Vector3;
    moonDir.set(-Math.cos(sa) * 0.8, -Math.sin(sa), 0.45).normalize();
    this.skyMat.uniforms.moonDir.value = moonDir;
    this.moon.position.copy(camPos).addScaledVector(moonDir, 2300);
    (this.moon.material as THREE.SpriteMaterial).opacity = clamp(this.out.night * 1.2, 0, 1) * lerp(1, 0.25, f.desat);

    // ---- sky follows camera ----
    this.skyMesh.position.copy(camPos);
    const spaceFade = opts?.spaceFade ?? 0;
    if (spaceFade > 0) {
      // in space: darken everything toward black + starfield boost
      const k = clamp(spaceFade, 0, 1);
      this.skyMat.uniforms.top.value.multiplyScalar(1 - k * 0.92);
      this.skyMat.uniforms.mid.value.multiplyScalar(1 - k * 0.9);
      this.skyMat.uniforms.bot.value.multiplyScalar(1 - k * 0.85);
      this.skyMat.uniforms.night.value = Math.max(this.skyMat.uniforms.night.value, k);
    }

    // ---- decks scroll + opacity ----
    for (const d of this.decks) {
      const m = d.m.material as THREE.MeshBasicMaterial;
      if (m.map) {
        m.map.offset.x += dt * d.speed * 0.0022;
        m.map.offset.y += dt * d.speed * 0.0006;
      }
      m.opacity = [0.5, 0.36, 0.22][this.decks.indexOf(d)] * f.deckOp * (1 - spaceFade);
      d.m.position.x = camPos.x;
      d.m.position.z = camPos.z;
      d.m.position.y = d.baseY + Math.sin(this.timeOfDay * 40 + d.speed) * 6;
    }

    // ---- banks drift & tint by sun ----
    const tint = this.skyMat.uniforms.sunCol.value as THREE.Color;
    this.drift += dt * 7;
    for (const b of this.banks) {
      b.s.position.x = b.x + Math.sin(b.ph + this.timeOfDay * 60) * 26;
      // seamless wrap in a 3600m ring around the camera
      const rel = ((b.z + this.drift - camPos.z) % 3600 + 5400) % 3600 - 1800;
      b.s.position.z = camPos.z + rel;
      const relX = ((b.x - camPos.x) % 3600 + 5400) % 3600 - 1800;
      b.s.position.x = camPos.x + relX + Math.sin(b.ph + this.timeOfDay * 60) * 26;
      const mat = b.s.material as THREE.SpriteMaterial;
      mat.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.55);
      mat.opacity = (0.3 + 0.16 * Math.sin(b.ph * 3.1 + this.timeOfDay * 90)) * f.cloudOp * (1 - spaceFade);
    }

    // ---- lightning ----
    this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.2);
    if (f.boltChance > 0 && this.weather === "storm") {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 2.5 + Math.random() * 9;
        this.flashT = 0.34;
        this.lightningFlash = 1;
        opts?.onLightning?.(0.6 + Math.random() * 0.4);
      }
    }
    if (this.flashT > 0) this.flashT -= dt;
    this.skyMat.uniforms.flash.value = Math.max(0, this.flashT) * 0.9;

    // ---- rain ----
    const rainOn = f.rain > 0.05;
    this.rainPts.visible = rainOn;
    if (rainOn) {
      this.rainMat.opacity += (clamp(f.rain, 0, 1) * 0.5 - this.rainMat.opacity) * Math.min(1, dt * 2);
      for (let i = 0; i < this.rainVel.length; i++) {
        const iy = i * 3 + 1;
        this.rainPos[iy] -= this.rainVel[i] * dt;
        this.rainPos[i * 3] += dt * 26; // wind
        if (this.rainPos[iy] < camPos.y - 30) {
          this.rainPos[i * 3] = camPos.x + (Math.random() - 0.5) * 120;
          this.rainPos[iy] = camPos.y + 55 + Math.random() * 30;
          this.rainPos[i * 3 + 2] = camPos.z + (Math.random() - 0.5) * 120;
        }
      }
      (this.rainPts.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      this.rainPts.position.set(0, 0, 0);
    } else {
      this.rainMat.opacity *= Math.max(0, 1 - dt * 2);
    }
  }
}
