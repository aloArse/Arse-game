// ==================== INVINCIBLE — Sky Guardian · 3D engine ====================
import * as THREE from "three";
import { FX, Trail } from "./fx";
import { City, CITY_HALF } from "./city";
import { Rig, POSES, HERO_PAL } from "./character";
import { Enemies, type EKind, type Enemy } from "./enemies";
import { audio } from "../game/audio";
import { installKeyboard, moveAxis, vertAxis, holdStrike, holdBlast, holdBlock, take, clearAll } from "../game/input";
import { makeHud, type HudState, type RunStats } from "../game/types";

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const CD_STRIKE = 0.36, CD_BLAST = 0.16, CD_DASH = 2.2, CD_SLAM = 6.5, CD_CYCLONE = 5.5;
const EN_BLAST = 4, EN_DASH = 12, EN_SLAM = 32, EN_CYCLONE = 18;
const MAX_ALT = 430;
const BOUND = CITY_HALF + 150;

interface Shot {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
  dmg: number;
  foe: boolean;
  r: number;
  active: boolean;
  light: number;
}

interface Bomb {
  mesh: THREE.Group;
  v: THREE.Vector3;
  life: number;
  active: boolean;
}

interface Orb {
  mesh: THREE.Mesh;
  kind: "hp" | "en";
  v: THREE.Vector3;
  t: number;
  active: boolean;
}

interface Hooks {
  onGameOver: (s: RunStats) => void;
  onPauseRequest: () => void;
  onFatal?: (message: string) => void;
}

export class Engine {
  // --- three ---
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private sky!: THREE.Mesh;
  private sunLight!: THREE.DirectionalLight;
  private heroLight!: THREE.PointLight;
  private shield!: THREE.Mesh;
  private clouds: THREE.Mesh[] = [];

  // --- systems ---
  fx: FX;
  city: City;
  enemies: Enemies;
  trail: Trail;
  private fistTrailL: Trail;
  private fistTrailR: Trail;
  rig: Rig;

  // --- state ---
  mode: "menu" | "playing" | "over" = "menu";
  paused = false;
  hud: HudState = makeHud();
  hooks: Hooks;

  private t = 0;
  private tReal = 0;
  private last = 0;
  private raf = 0;
  private destroyed = false;
  private failed = false;
  private contextLost = false;

  // hero
  private pos = new THREE.Vector3(0, 90, 220);
  private vel = new THREE.Vector3();
  private yaw = 0;
  private roll = 0;
  private flyK = 0;
  private cruise = 0;
  private hp = 100; private en = 100; private od = 0; private odT = 0;
  private iT = 0; private hurtT = 0; private regenT = 0;
  private punchT = 0; private punchSide = 0; private blastT = 0;
  private comboStep = 0; private comboWindow = 0;
  private clapT = 0; private clapFired = false;
  private grabbed: Enemy | null = null;
  private grabT = 0; private throwT = 0;
  private slamT = 0;
  private slamPhase: "none" | "rise" | "dive" | "pdRise" | "pdDive" = "none";
  private dashT = 0; private dashDir = new THREE.Vector3(0, 0, 1); private dashId = 0;
  private cycloneT = 0; private cycloneHitT = 0; private cycloneSpin = 0;
  private blockT = 0;
  private flurryOn = false;
  private cd = { strike: 0, blast: 0, dash: 0, slam: 0, cyclone: 0 };
  private heroDead = false; private deadT = 0;

  // camera rig
  private camYaw = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private stopT = 0;
  private slowT = 0;
  private fovKick = 0;

  // run
  private wave = 0; private quota = 0; private spawned = 0;
  private spawnT = 0; private betweenT = 0;
  private kills = 0; private score = 0; private combo = 0; private comboT = 0;
  private maxCombo = 0; private runTime = 0;
  private odAnnounced = false;

  // pools
  private shots: Shot[] = [];
  private bombs: Bomb[] = [];
  private orbs: Orb[] = [];

  // scratch
  private _v = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private _push = new THREE.Vector3();
  private _fwd = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _aim = new THREE.Vector3(0, 0, 1);

  constructor(canvas: HTMLCanvasElement, hooks: Hooks) {
    this.hooks = hooks;
    installKeyboard();

    const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    const lowPower = mobile && (memory <= 4 || cores <= 4);
    const dprLimit = lowPower ? 1.15 : mobile ? 1.45 : 1.8;
    const dpr = Math.min(window.devicePixelRatio || 1, dprLimit);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowPower && dpr < 1.6,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 4200);
    this.camera.position.set(0, 100, 250);

    this.scene.fog = new THREE.FogExp2(0x5a4a72, 0.0017);

    this.buildSky();
    this.buildLights();

    this.fx = new FX(this.scene);
    this.city = new City(this.scene);
    this.enemies = new Enemies(this.scene);
    this.trail = new Trail(this.scene, 28, 0xaad6ff, 0.55);
    this.fistTrailL = new Trail(this.scene, 11, 0xffe9b0, 0.34);
    this.fistTrailR = new Trail(this.scene, 11, 0xffe9b0, 0.34);

    this.rig = new Rig(HERO_PAL, 1);
    this.scene.add(this.rig.group);

    this.buildShield();
    this.buildPools();

    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
    window.addEventListener("resize", this.onResize);
    this.toMenu();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------------- setup ---------------- */

  private buildSky(): void {
    const sunDir = new THREE.Vector3(-0.55, 0.17, -0.82).normalize();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x141a44) },
        mid: { value: new THREE.Color(0x6b4f8e) },
        bot: { value: new THREE.Color(0xff9a5a) },
        sunDir: { value: sunDir },
        sunCol: { value: new THREE.Color(0xffd9a0) },
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
        uniform vec3 sunDir; uniform vec3 sunCol;
        varying vec3 vW;
        void main() {
          vec3 d = normalize(vW);
          float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = mix(bot, mid, smoothstep(0.42, 0.56, h));
          c = mix(c, top, smoothstep(0.54, 0.96, h));
          float s = max(0.0, dot(d, normalize(sunDir)));
          c += sunCol * pow(s, 220.0) * 3.2;
          c += sunCol * pow(s, 8.0) * 0.42;
          c += vec3(0.9, 0.5, 0.35) * pow(s, 2.0) * 0.13;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 20), mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // high cloud decks
    const tex = this.cloudTexture();
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(4200, 4200),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: i === 0 ? 0.5 : 0.32,
          depthWrite: false, fog: false, side: THREE.DoubleSide,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 330 + i * 165;
      m.renderOrder = -1;
      this.clouds.push(m);
      this.scene.add(m);
    }
  }

  private cloudTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 512, 512);
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 26 + Math.random() * 82;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const warm = Math.random() > 0.5;
      grd.addColorStop(0, warm ? "rgba(255,215,185,0.5)" : "rgba(215,205,240,0.42)");
      grd.addColorStop(0.55, warm ? "rgba(245,190,170,0.2)" : "rgba(190,185,225,0.17)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    return t;
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xffd9b0, 0x2a2740, 1.15);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight(0xffc58a, 2.5);
    this.sunLight.position.set(-420, 190, -620);
    this.scene.add(this.sunLight);

    const rim = new THREE.DirectionalLight(0x6f8dff, 0.85);
    rim.position.set(380, 140, 520);
    this.scene.add(rim);

    this.scene.add(new THREE.AmbientLight(0x40406a, 0.6));

    this.heroLight = new THREE.PointLight(0xffc06a, 0, 62, 2);
    this.scene.add(this.heroLight);
  }

  private buildShield(): void {
    // energy barrier shown while bracing
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6ecbff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.35, 22, 16), mat);
    this.shield.position.set(0, 0.25, 0.35);
    this.shield.scale.set(0.95, 1.2, 0.85);
    this.shield.visible = false;
    this.rig.group.add(this.shield);
  }

  private buildPools(): void {
    const boltGeo = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 90; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd23f, transparent: true, opacity: 0.96,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const mesh = new THREE.Mesh(boltGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.shots.push({
        mesh, v: new THREE.Vector3(), life: 0, dmg: 0,
        foe: false, r: 0.4, active: false, light: 0,
      });
    }

    // Flaxan bombs
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 10, 8),
        new THREE.MeshStandardMaterial({
          color: 0x2c2836, roughness: 0.5, metalness: 0.7,
          emissive: new THREE.Color(0xff3311), emissiveIntensity: 0.55,
        }),
      );
      body.scale.set(1, 1.35, 1);
      g.add(body);
      for (let f = 0; f < 3; f++) {
        const a = (f / 3) * Math.PI * 2;
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.34, 0.3),
          new THREE.MeshStandardMaterial({ color: 0x1d1a26, roughness: 0.6, metalness: 0.6 }),
        );
        fin.position.set(Math.cos(a) * 0.4, 0.55, Math.sin(a) * 0.4);
        fin.rotation.y = -a;
        g.add(fin);
      }
      g.visible = false;
      this.scene.add(g);
      this.bombs.push({ mesh: g, v: new THREE.Vector3(), life: 0, active: false });
    }

    const orbGeo = new THREE.IcosahedronGeometry(0.9, 0);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x7dff9e, emissive: new THREE.Color(0x7dff9e),
        emissiveIntensity: 2.4, roughness: 0.25,
      });
      const mesh = new THREE.Mesh(orbGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.orbs.push({ mesh, kind: "hp", v: new THREE.Vector3(), t: 0, active: false });
    }
  }

  private onResize = (): void => {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    this.last = performance.now();
  };

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.onContextRestored);
    audio.stopMusic();
    this.enemies.clear();
    this.city.dispose();
    this.renderer.dispose();
  }

  /* ---------------- run control ---------------- */

  toMenu(): void {
    this.mode = "menu";
    this.enemies.clear();
    this.fx.reset();
    this.city.reset();
    this.resetHero();
    this.pos.set(0, 150, 300);
    this.camYaw = Math.PI;
    this.deactivateAll();
    clearAll();
    audio.stopMusic();
  }

  startRun(): void {
    this.mode = "playing";
    this.enemies.clear();
    this.fx.reset();
    this.city.reset();
    this.resetHero();
    this.deactivateAll();
    this.hud = makeHud();
    this.wave = 0; this.quota = 0; this.spawned = 0;
    this.kills = 0; this.score = 0; this.combo = 0; this.comboT = 0;
    this.maxCombo = 0; this.runTime = 0;
    this.betweenT = 1.8;
    this.odAnnounced = false;
    this.stopT = 0; this.slowT = 0; this.shake = 0; this.fovKick = 0;
    clearAll();
    audio.ensure();
    audio.startMusic();
    this.setMsg("DEFEND THE CITY — WAVE 1 INBOUND", 2.6, "info");
  }

  private resetHero(): void {
    this.pos.set(0, 110, 180);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI;
    this.roll = 0; this.flyK = 0; this.cruise = 0;
    this.hp = 100; this.en = 100; this.od = 0; this.odT = 0;
    this.iT = 0; this.hurtT = 0; this.regenT = 0;
    this.punchT = 0; this.blastT = 0; this.slamT = 0;
    this.comboStep = 0; this.comboWindow = 0;
    this.clapT = 0; this.clapFired = false;
    if (this.grabbed) this.grabbed.grabbed = false;
    this.grabbed = null; this.grabT = 0; this.throwT = 0;
    this.slamPhase = "none";
    this.dashT = 0; this.dashId = 0;
    this.cycloneT = 0; this.cycloneHitT = 0; this.cycloneSpin = 0;
    this.blockT = 0; this.flurryOn = false;
    this.cd = { strike: 0, blast: 0, dash: 0, slam: 0, cyclone: 0 };
    this.heroDead = false; this.deadT = 0;
    this.rig.group.visible = true;
    this.rig.setPoseImmediate(POSES.hover);
    this.rig.setEyeGlow(0xffffff, 1.2);
    this.trail.reset(this.pos);
    this.fistTrailL.reset(this.pos);
    this.fistTrailR.reset(this.pos);
    (this.shield.material as THREE.MeshBasicMaterial).opacity = 0;
    this.shield.visible = false;
    this.camPos.copy(this.pos).add(new THREE.Vector3(0, 4, -14));
    this.camera.position.copy(this.camPos);
    this.camLook.copy(this.pos);
    this.camera.lookAt(this.camLook);
  }

  private deactivateAll(): void {
    for (const s of this.shots) { s.active = false; s.mesh.visible = false; }
    for (const b of this.bombs) { b.active = false; b.mesh.visible = false; }
    for (const o of this.orbs) { o.active = false; o.mesh.visible = false; }
  }

  /* ---------------- loop ---------------- */

  private loop = (ts: number): void => {
    if (this.destroyed || this.failed) return;
    try {
      const raw = Math.min(0.05, this.last ? (ts - this.last) / 1000 : 0.016);
      this.last = ts;

      if (!this.paused && !this.contextLost) {
        let scale = 1;
        if (this.stopT > 0) { this.stopT -= raw; scale = 0.06; }
        else if (this.slowT > 0) { this.slowT -= raw; scale = 0.32; }
        const dt = raw * scale;
        this.t += dt;
        this.tReal += raw;

        if (this.mode === "menu") this.updateMenu(dt, raw);
        else if (this.mode === "playing") this.updatePlaying(dt, raw);
        else this.updateCamera(raw, true);

        this.city.update(dt, this.fx);
        this.fx.update(dt, this.camera);
        this.updateSkyAndClouds(raw);
      }

      if (!this.contextLost) this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(this.loop);
    } catch (error) {
      this.failed = true;
      const message = error instanceof Error ? error.message : "Unknown 3D engine error";
      console.error("3D engine stopped", error);
      this.hooks.onFatal?.(message);
    }
  };

  private updateSkyAndClouds(dt: number): void {
    this.sky.position.copy(this.camera.position);
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      const m = c.material as THREE.MeshBasicMaterial;
      if (m.map) {
        m.map.offset.x += dt * (0.0035 + i * 0.0022);
        m.map.offset.y += dt * 0.0011;
      }
      c.position.x = this.camera.position.x;
      c.position.z = this.camera.position.z;
    }
  }

  /* ---------------- menu attract cam ---------------- */

  private updateMenu(dt: number, raw: number): void {
    const r = 300;
    const a = this.t * 0.075;
    this.pos.set(Math.cos(a) * r, 132 + Math.sin(this.t * 0.4) * 18, Math.sin(a) * r);
    this._v.set(-Math.sin(a), 0, Math.cos(a));
    this.vel.copy(this._v).multiplyScalar(24);
    this.yaw = Math.atan2(this._v.x, this._v.z);
    this.flyK = lerp(this.flyK, 0.55, 1 - Math.exp(-2 * dt));

    this.rig.group.position.copy(this.pos);
    this.rig.group.rotation.set(0, this.yaw, 0);
    this.rig.body.rotation.x = lerp(this.rig.body.rotation.x, 0.75, 1 - Math.exp(-3 * dt));
    this.rig.body.rotation.z = Math.sin(this.t * 0.6) * 0.12;
    this.rig.blendPose(POSES.fist, Math.min(1, dt * 4));
    this.rig.addFlutter(this.t, 0.7);
    this.rig.setAura(false, 0, 0);
    this.trail.update(this.pos, this.camera, 0.5);
    this.fistTrailL.update(this.pos, this.camera, 0);
    this.fistTrailR.update(this.pos, this.camera, 0);

    // slow cinematic orbit behind the hero
    this.camYaw = this.yaw;
    this._v.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    this.camPos.set(
      this.pos.x - this._v.x * 15 + 2,
      this.pos.y + 5.5,
      this.pos.z - this._v.z * 15,
    );
    this.camera.position.lerp(this.camPos, 1 - Math.exp(-3 * raw));
    this.camLook.copy(this.pos).addScaledVector(this._v, 9);
    this.camera.lookAt(this.camLook);
    this.camera.fov = lerp(this.camera.fov, 64, 1 - Math.exp(-2 * raw));
    this.camera.updateProjectionMatrix();

    this.heroLight.position.copy(this.pos);
    this.heroLight.intensity = 0;
  }

  /* ---------------- gameplay ---------------- */

  private updatePlaying(dt: number, raw: number): void {
    if (take("pause")) this.hooks.onPauseRequest();

    this.runTime += dt;
    this.shake *= Math.exp(-5.5 * raw);
    this.hud.hurt = Math.max(0, this.hud.hurt - raw * 1.5);
    this.hud.msgT = Math.max(0, this.hud.msgT - raw);
    if (this.comboT > 0) {
      this.comboT -= raw;
      if (this.comboT <= 0) this.combo = 0;
    }

    if (this.heroDead) {
      this.updateDeath(dt, raw);
    } else {
      this.updateHero(dt, raw);
      this.updateWaves(dt);
    }

    this.updateShots(dt);
    this.updateBombs(dt);
    this.updateOrbs(dt);
    this.updateThrown(dt);

    this.enemies.update({
      dt,
      hero: this.pos,
      heroVel: this.vel,
      heroDead: this.heroDead,
      fx: this.fx,
      city: this.city,
      time: this.t,
      shoot: (from, dir, speed, dmg, color, radius) => this.spawnShot(from, dir, speed, dmg, color, radius, true),
      hitPlayer: (dmg, from) => this.damagePlayer(dmg, from),
      shake: (a) => { this.shake = Math.max(this.shake, a); },
      slamBlast: (at, radius, dmg) => this.enemySlam(at, radius, dmg),
      dropBomb: (from, vel) => this.dropBomb(from, vel),
      sfx: (n, p) => audio.play(n as "punch", p),
    });

    this.updateCamera(raw, false);
    this.syncHud();
  }

  private updateDeath(dt: number, raw: number): void {
    this.deadT -= raw;
    this.vel.y -= 70 * dt;
    this.vel.multiplyScalar(Math.exp(-0.6 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const surf = this.city.surfaceY(this.pos.x, this.pos.z);
    if (this.pos.y < surf + 1) {
      this.pos.y = surf + 1;
      this.vel.multiplyScalar(0.2);
    }
    this.rig.group.position.copy(this.pos);
    this.rig.body.rotation.x += raw * 3;
    this.rig.blendPose(POSES.hurt, Math.min(1, raw * 5));
    this.fistTrailL.update(this.pos, this.camera, 0);
    this.fistTrailR.update(this.pos, this.camera, 0);
    this.updateCamera(raw, true);
    if (this.deadT <= 0 && this.mode === "playing") {
      this.mode = "over";
      this.hooks.onGameOver({
        score: this.score, wave: this.wave, kills: this.kills,
        maxCombo: this.maxCombo, demolished: this.city.demolished, time: this.runTime,
      });
    }
  }

  private updateHero(dt: number, raw: number): void {
    // ---- timers ----
    this.iT = Math.max(0, this.iT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.regenT = Math.max(0, this.regenT - dt);
    this.punchT = Math.max(0, this.punchT - dt);
    this.blastT = Math.max(0, this.blastT - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    if (this.comboWindow <= 0) { this.comboStep = 0; this.flurryOn = false; }
    if (this.clapT > 0) {
      this.clapT -= dt;
      if (!this.clapFired && this.clapT <= 0.18) { this.clapFired = true; this.thunderClap(); }
      if (this.clapT <= 0) this.clapT = 0;
    }
    this.updateGrab(dt);
    this.cd.strike = Math.max(0, this.cd.strike - dt);
    this.cd.blast = Math.max(0, this.cd.blast - dt);
    this.cd.dash = Math.max(0, this.cd.dash - dt);
    this.cd.slam = Math.max(0, this.cd.slam - dt);
    this.cd.cyclone = Math.max(0, this.cd.cyclone - dt);

    const od = this.odT > 0;
    if (od) {
      this.odT -= dt;
      if (this.odT <= 0) { this.odT = 0; this.od = 0; }
    }

    // ---- camera-relative input ----
    const mv = moveAxis();
    const vert = vertAxis();
    this._fwd.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    this._right.set(this._fwd.z, 0, -this._fwd.x);

    this._v.set(0, 0, 0);
    this._v.addScaledVector(this._right, mv.x);
    this._v.addScaledVector(this._fwd, mv.y);
    const flatIn = this._v.length();
    if (flatIn > 1) this._v.divideScalar(flatIn);

    // afterburner ramps while the stick is held forward
    if (mv.mag > 0.75) this.cruise = Math.min(1, this.cruise + dt * 0.45);
    else this.cruise = Math.max(0, this.cruise - dt * 1.4);

    // ---- brace / block ----
    const busy =
      this.slamPhase !== "none" || this.dashT > 0 || this.cycloneT > 0 ||
      this.punchT > 0 || this.blastT > 0 || !!this.grabbed || this.clapT > 0;
    const wantBlock = holdBlock() && !busy;
    this.blockT = wantBlock
      ? Math.min(1, this.blockT + dt * 9)
      : Math.max(0, this.blockT - dt * 10);

    const blocking = this.blockT > 0.55;
    const maxSpd = (36 + this.cruise * 62) * (od ? 1.22 : 1) * (blocking ? 0.4 : 1);
    const accel = (od ? 132 : 108) * (blocking ? 0.4 : 1);

    // aim direction (facing, used by abilities)
    if (flatIn > 0.1 || Math.abs(vert) > 0.1) {
      this._aim.copy(this._v);
      this._aim.y += vert * 0.85;
      if (this._aim.lengthSq() > 1e-4) this._aim.normalize();
    } else {
      this._aim.set(Math.sin(this.yaw), this._aim.y * 0.9, Math.cos(this.yaw)).normalize();
    }

    // ---- abilities ----
    if (this.cd.strike <= 0 && this.slamPhase === "none" && this.cycloneT <= 0 && (holdStrike() || take("strike"))) this.doStrike();
    if (holdBlast() && this.cd.blast <= 0 && this.en >= EN_BLAST && this.slamPhase === "none" && this.dashT <= 0 && this.cycloneT <= 0) this.doBlast();
    if (this.cd.dash <= 0 && this.en >= EN_DASH && this.slamPhase === "none" && this.cycloneT <= 0 && take("dash")) this.doDash();
    if (this.slamPhase === "none" && this.cycloneT <= 0 && take("slam")) {
      if (this.grabbed) this.startPiledrive();
      else if (this.cd.slam <= 0 && this.en >= EN_SLAM) this.startSlam();
    }
    if (this.cd.cyclone <= 0 && this.en >= EN_CYCLONE && this.slamPhase === "none" && this.cycloneT <= 0 && this.dashT <= 0 && !this.grabbed && take("cyclone")) this.doCyclone();
    if (take("grab") && this.slamPhase === "none" && this.cycloneT <= 0) this.doGrabOrClap();
    if (this.od >= 100 && this.odT <= 0 && take("over")) this.triggerOverdrive();
    if (this.od >= 100 && this.odT <= 0 && !this.odAnnounced) {
      this.odAnnounced = true;
      this.setMsg("OVERDRIVE READY", 2.2, "warn");
      audio.play("wave", 0.7);
    }

    // ---- movement integration ----
    if (this.dashT > 0) {
      this.dashT -= dt;
      // supersonic dashes can be steered slightly
      this.dashDir.lerp(this._aim, Math.min(1, dt * 2.4)).normalize();
      this.vel.copy(this.dashDir).multiplyScalar(205);
      this.emitDashFx(dt);
      if (this.dashT <= 0) this.vel.multiplyScalar(0.32);
    } else if (this.cycloneT > 0) {
      this.updateCyclone(dt);
    } else if (this.slamPhase !== "none") {
      this.updateSlam(dt);
    } else {
      // horizontal thrust
      this._v2.copy(this._v).multiplyScalar(maxSpd);
      this._v2.y = vert * 46;
      // approach target velocity
      const k = 1 - Math.exp(-(accel / Math.max(12, maxSpd)) * dt * 2.4);
      this.vel.x = lerp(this.vel.x, this._v2.x, k);
      this.vel.z = lerp(this.vel.z, this._v2.z, k);
      this.vel.y = lerp(this.vel.y, this._v2.y, 1 - Math.exp(-5.5 * dt));
      // punch lunge
      if (this.punchT > 0) this.vel.addScaledVector(this._aim, 52 * dt * 10 * this.punchT);
    }

    this.pos.addScaledVector(this.vel, dt);

    // ---- world bounds ----
    this.pos.x = clamp(this.pos.x, -BOUND, BOUND);
    this.pos.z = clamp(this.pos.z, -BOUND, BOUND);
    if (this.pos.y > MAX_ALT) { this.pos.y = MAX_ALT; this.vel.y = Math.min(0, this.vel.y); }

    // ---- city collision / smash-through ----
    this.resolveCityCollision(dt);

    // ---- ground ----
    if (this.pos.y < 1.4) {
      this.pos.y = 1.4;
      if (this.vel.y < -34) {
        this.groundImpact();
      }
      this.vel.y = Math.max(0, this.vel.y * -0.15);
      this.vel.x *= Math.exp(-2.4 * dt);
      this.vel.z *= Math.exp(-2.4 * dt);
    }

    // ---- regen ----
    if (this.en < 100 && this.dashT <= 0) this.en = Math.min(100, this.en + 13 * dt);
    if (this.regenT <= 0 && this.hp < 100) this.hp = Math.min(100, this.hp + 3.4 * dt);

    // ---- orientation + animation ----
    this.animateHero(dt, raw, mv.mag, vert, od, blocking);

    // ---- speed fx ----
    const speed = this.vel.length();
    if (speed > 62 && Math.random() < dt * 26) {
      this._v2.copy(this.vel).normalize();
      const p = this._v.copy(this.pos).addScaledVector(this._v2, -2.5);
      this.fx.jet(p.x, p.y, p.z, -this._v2.x, -this._v2.y, -this._v2.z,
        0xbfe0ff, 2, 16, 1.1, 0.3, 0.32);
    }
    // sonic boom
    if (speed > 92 && this.cruise > 0.92 && Math.random() < dt * 1.6) {
      this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xffffff, 13, 0.42, false, 1.1);
      audio.play("dash", 0.34);
    }

    this.trail.update(this.pos, this.camera, clamp((speed - 26) / 70, 0, 1) * (this.dashT > 0 ? 1 : 0.8));

    // hero light
    const lightK = this.odT > 0 ? 3.4 : this.dashT > 0 ? 2.6 : this.cycloneT > 0 ? 2.2 : blocking ? 1.6 : speed > 60 ? 1.1 : 0.4;
    this.heroLight.position.copy(this.pos);
    this.heroLight.color.setHex(
      this.odT > 0 ? 0xff9a3c : this.cycloneT > 0 ? 0xffd23f : blocking ? 0x6ecbff : 0x8fc4ff,
    );
    this.heroLight.intensity = lerp(this.heroLight.intensity, lightK * 22, 1 - Math.exp(-6 * raw));

    // overdrive aura particles
    if (od && Math.random() < dt * 45) {
      this.fx.spark(
        this.pos.x + (Math.random() - 0.5) * 2.4,
        this.pos.y + (Math.random() - 0.5) * 3,
        this.pos.z + (Math.random() - 0.5) * 2.4,
        Math.random() > 0.5 ? 0xff7a3c : 0xffd23f, 1, 5, 0.5, 0.5, 7, 1,
      );
    }
  }

  private resolveCityCollision(dt: number): void {
    const b = this.city.collide(this.pos, 1.6, this._push);
    if (!b) return;
    const speed = this.vel.length();
    if (speed > 44 || this.dashT > 0) {
      // SMASH THROUGH
      const hits = this.city.smashThrough(this.pos, this.dashT > 0 ? 4.6 : 3.4, this.fx, 22);
      if (hits > 0) {
        this.score += hits * 14;
        this.shake = Math.max(this.shake, this.dashT > 0 ? 9 : 6.5);
        this.stopT = Math.max(this.stopT, 0.045);
        this.fx.flash(this.pos.x, this.pos.y, this.pos.z, 0xffd0a0, 7, 0.22);
        this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xffe0b0, 20, 0.4, false, 1.3);
        audio.play("boom", 0.8);
        if (this.dashT <= 0) this.vel.multiplyScalar(0.86);
        this.addCombo(1);
      }
    } else {
      // slide along the surface
      this.pos.add(this._push);
      this._v2.copy(this._push).normalize();
      const into = this.vel.dot(this._v2);
      if (into < 0) this.vel.addScaledVector(this._v2, -into * 1.05);
      this.vel.multiplyScalar(Math.exp(-2 * dt));
    }
  }

  private groundImpact(): void {
    const p = this.pos;
    this.fx.ring(p.x, 0.8, p.z, 0xffd2a0, 26, 0.55, true, 1.4);
    this.fx.smoke(p.x, 1.5, p.z, 12, 12, 3, 0xa1959a, 2.6);
    this.fx.spark(p.x, 1, p.z, 0xffc978, 18, 22, 0.5, 0.5, -20, 0.4);
    this.city.spawnDebris(p.x, 1, p.z, 8, 16, 3);
    this.shake = Math.max(this.shake, 6);
    audio.play("boom", 0.7);
  }

  private animateHero(dt: number, raw: number, moveMag: number, vert: number, od: boolean, blocking: boolean): void {
    const speed = this.vel.length();
    const flat = Math.hypot(this.vel.x, this.vel.z);

    // yaw follows travel direction (or aim while attacking)
    let wantYaw = this.yaw;
    if (this.cycloneT > 0) {
      wantYaw = this.yaw; // spinning handles its own rotation
    } else if (this.dashT > 0) {
      wantYaw = Math.atan2(this.dashDir.x, this.dashDir.z);
    } else if (this.punchT > 0 || this.blastT > 0) {
      wantYaw = Math.atan2(this._aim.x, this._aim.z);
    } else if (flat > 2.5) {
      wantYaw = Math.atan2(this.vel.x, this.vel.z);
    } else if (moveMag > 0.1 || blocking) {
      wantYaw = Math.atan2(this._aim.x, this._aim.z);
    }
    this.yaw = lerpAngle(this.yaw, wantYaw, 1 - Math.exp(-9 * dt));

    // flight blend + banking
    const targetFly = this.dashT > 0 ? 1 : clamp((speed - 14) / 46, 0, 1);
    this.flyK = lerp(this.flyK, targetFly, 1 - Math.exp(-6 * dt));

    // ---- base locomotion pose ----
    let pose = POSES.hover;
    let blend = 8;
    const threatNear = this.enemies.list.some((e) => !e.dead && !e.grabbed && e.obj.position.distanceToSquared(this.pos) < 70 * 70);
    if (this.slamPhase === "pdRise" || this.slamPhase === "pdDive") { pose = this.slamPhase === "pdRise" ? POSES.slamUp : POSES.slamDown; blend = 15; }
    else if (this.slamPhase === "rise") { pose = POSES.slamUp; blend = 15; }
    else if (this.slamPhase === "dive") { pose = POSES.slamDown; blend = 15; }
    else if (this.cycloneT > 0) { pose = POSES.spin; blend = 14; }
    else if (this.dashT > 0) { pose = POSES.dash; blend = 18; }
    else if (this.clapT > 0) { pose = POSES.hover; blend = 10; }
    else if (this.throwT > 0) { pose = POSES.hover; blend = 10; }
    else if (this.punchT > 0) { pose = POSES.idleFight; blend = 12; }
    else if (this.grabbed) { pose = POSES.grab; blend = 14; }
    else if (this.blastT > 0) { pose = POSES.blast; blend = 14; }
    else if (this.hurtT > 0) { pose = POSES.hurt; blend = 12; }
    else if (this.flyK > 0.55) { pose = this.cruise > 0.5 ? POSES.fist : POSES.fly; blend = 7; }
    else if (this.flyK > 0.12) { pose = POSES.fly; blend = 6; }
    else { pose = (moveMag > 0.05 || Math.abs(vert) > 0.05 || threatNear) ? POSES.idleFight : POSES.idle; blend = 5; }

    this.rig.blendPose(pose, Math.min(1, dt * blend));

    // brace pose layered on top while blocking
    if (this.blockT > 0.03) {
      this.rig.blendPose(POSES.block, Math.min(1, dt * 12) * this.blockT);
    }

    this.rig.addFlutter(this.t, this.flyK * 0.85 + 0.15);
    // flex the arms during strikes / holds
    this.rig.setFlex(
      this.punchT > 0 ? 1 : this.grabbed ? 0.7 : this.clapT > 0 ? 0.8 : this.cycloneT > 0 ? 0.9 : 0,
    );
    // track the nearest threat with the head
    const look = this.enemies.list.find((e) => !e.dead && !e.grabbed);
    this.rig.lookAt(
      this.punchT > 0 || this.dashT > 0 || this.cycloneT > 0 ? null : look ? look.obj.position : null,
      Math.min(1, dt * 4),
    );

    // keyframed action clips (punches, throws, claps...) ride on top
    this.rig.updateClip(dt);

    // body pitch: upright hovering → horizontal at speed, plus climb/dive angle
    const climb = clamp(this.vel.y / 55, -1, 1);
    const pitchTarget =
      this.slamPhase === "dive" || this.slamPhase === "pdDive" ? 0.2 :
        this.slamPhase === "rise" || this.slamPhase === "pdRise" ? -0.35 :
          this.cycloneT > 0 ? 0.1 :
            this.flyK * (1.28 - climb * 0.55) + (1 - this.flyK) * (vert > 0 ? -0.12 : 0.06);
    this.rig.body.rotation.x = lerp(this.rig.body.rotation.x, pitchTarget, 1 - Math.exp(-7 * dt));

    // bank/roll into turns
    let yawRate = 0;
    if (flat > 6) {
      const travelYaw = Math.atan2(this.vel.x, this.vel.z);
      let d = (travelYaw - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      yawRate = d;
    }
    const rollTarget = clamp(-yawRate * 2.4, -0.7, 0.7) * this.flyK
      + (this.dashT > 0 ? 0 : Math.sin(this.t * 1.4) * 0.03);
    this.roll = lerp(this.roll, rollTarget, 1 - Math.exp(-5 * dt));
    this.rig.body.rotation.z = this.roll;

    // hover bob when drifting slowly
    this.rig.body.position.y = Math.sin(this.t * 1.9) * 0.09 * (1 - this.flyK);

    this.rig.group.position.copy(this.pos);
    // cyclone adds a fast spin on top of the facing yaw
    if (this.cycloneT > 0) {
      this.cycloneSpin += dt * (Math.PI * 2 * 3.4 / 0.9);
      this.rig.group.rotation.set(0, this.yaw + this.cycloneSpin, 0);
    } else {
      // unwind along the shortest path so the hero never snaps
      const twoPi = Math.PI * 2;
      this.cycloneSpin = ((this.cycloneSpin % twoPi) + twoPi) % twoPi;
      if (this.cycloneSpin > Math.PI) this.cycloneSpin -= twoPi;
      this.cycloneSpin *= Math.exp(-9 * dt);
      this.rig.group.rotation.set(0, this.yaw + this.cycloneSpin, 0);
    }

    // ---- fist trails ----
    const trailK = this.punchT > 0 || this.cycloneT > 0 ? 1 : 0;
    this.rig.fistL.getWorldPosition(this._v);
    this.fistTrailL.update(this._v, this.camera, trailK * (this.cycloneT > 0 ? 1 : this.punchSide === 1 ? 0.9 : 0.35));
    this.rig.fistR.getWorldPosition(this._v);
    this.fistTrailR.update(this._v, this.camera, trailK * (this.cycloneT > 0 ? 1 : this.punchSide === 0 ? 0.9 : 0.35));

    // eyes + aura
    if (od) {
      this.rig.setEyeGlow(0xffb03c, 3.6);
      this.rig.setAura(true, 0xff8a30, 0.3 + Math.sin(this.t * 9) * 0.08);
    } else if (this.cycloneT > 0) {
      this.rig.setEyeGlow(0xffd23f, 2.8);
      this.rig.setAura(true, 0xffd23f, 0.18);
    } else {
      this.rig.setEyeGlow(0xffffff, this.dashT > 0 ? 2.6 : 1.25);
      this.rig.setAura(this.dashT > 0, 0x8fc4ff, this.dashT > 0 ? 0.22 : 0);
    }

    // energy shield while bracing
    const sm = this.shield.material as THREE.MeshBasicMaterial;
    this.shield.visible = this.blockT > 0.05;
    sm.opacity = this.blockT * (0.16 + Math.sin(this.tReal * 14) * 0.05);

    // blink while invulnerable
    this.rig.group.visible = !(this.iT > 0 && this.hurtT <= 0 && Math.sin(this.tReal * 40) > 0.2);
    void raw;
  }

  private emitDashFx(dt: number): void {
    const p = this.pos;
    this.fx.jet(p.x, p.y, p.z, -this.dashDir.x, -this.dashDir.y, -this.dashDir.z,
      0xaad6ff, Math.ceil(dt * 160), 26, 1.2, 0.42, 0.3);
    // carve through buildings while dashing
    const hits = this.city.smashThrough(p, 4.6, this.fx, 26);
    if (hits > 0) {
      this.shake = Math.max(this.shake, 8);
      this.score += hits * 16;
      audio.play("boom", 0.7);
    }
    // damage enemies passed through
    for (const e of this.enemies.list) {
      if (e.dead || e.dashMark === this.dashId) continue;
      if (e.obj.position.distanceTo(p) < e.r + 3.4) {
        e.dashMark = this.dashId;
        this.damageEnemy(e, this.odT > 0 ? 62 : 34, true);
        this.stopT = Math.max(this.stopT, 0.05);
      }
    }
  }

  /* ---------------- abilities ---------------- */

  private nearestEnemy(maxDist: number, cone: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxDist;
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      this._v2.subVectors(e.obj.position, this.pos);
      const d = this._v2.length();
      if (d > bestD) continue;
      if (cone > -1) {
        this._v2.divideScalar(d || 1);
        if (this._v2.dot(this._aim) < cone) continue;
      }
      best = e; bestD = d;
    }
    return best;
  }

  /** 3-hit chain: jab → cross → launching uppercut (+ held-strike flurry) */
  private doStrike(): void {
    const od = this.odT > 0;
    // throwing a held enemy takes priority
    if (this.grabbed) { this.doThrow(); return; }

    // dash-cancel: striking mid-dash extends into a heavy dash punch
    if (this.dashT > 0) { this.doDashPunch(); return; }

    const held = holdStrike();

    // ---- FLURRY: hold strike with a live close target → rapid barrage ----
    if (held && this.comboWindow > 0 && this.comboStep !== 0) {
      const tgt = this.nearestEnemy(17, -1);
      if (tgt) {
        this.flurryOn = true;
        this.comboWindow = 0.85; // the barrage sustains the chain
        this.cd.strike = CD_STRIKE * 0.38 * (od ? 0.72 : 1);
        this.punchT = 0.12;
        this.rig.playClip(this.punchSide === 0 ? "flurryR" : "flurryL", od ? 1.4 : 1.15);
        this.punchSide = 1 - this.punchSide;

        // magnetism: lunge toward the target so the barrage connects
        this._aim.subVectors(tgt.obj.position, this.pos).normalize();
        const d = tgt.obj.position.distanceTo(this.pos);
        this.vel.addScaledVector(this._aim, Math.min(46, d * 5.5));

        const reach = 3.0;
        const hitPos = this._v.copy(this.pos).addScaledVector(this._aim, reach);
        const dmg = (od ? 40 : 24);
        let hitAny = false;
        for (const e of this.enemies.list) {
          if (e.dead || e.grabbed) continue;
          if (e.obj.position.distanceTo(hitPos) < e.r + 3.2) {
            hitAny = true;
            this.damageEnemy(e, dmg, true);
            e.v.addScaledVector(this._aim, e.kind === "boss" ? 10 : 34);
            e.v.y += 6;
          }
        }
        const b = this.city.collide(hitPos, 2.2, this._push);
        if (b) {
          hitAny = true;
          const before = this.city.demolished;
          this.city.damage(b, 34 * (od ? 1.8 : 1), hitPos, this.fx, 18);
          if (this.city.demolished > before) this.onDemolish();
        }
        if (hitAny) {
          this.stopT = Math.max(this.stopT, 0.028);
          this.shake = Math.max(this.shake, 3.2);
          this.fx.flash(hitPos.x, hitPos.y, hitPos.z, 0xfff0c0, 2.6, 0.1);
          this.fx.spark(hitPos.x, hitPos.y, hitPos.z, 0xffe27a, 12, 22, 0.4, 0.35, -6, 1);
          audio.play("flurry", 1);
          navigator.vibrate?.(8);
        }
        return;
      }
      // no target in range — flurry drops, wait for release
      this.flurryOn = false;
    }

    // ---- regular chain ----
    const step = this.comboStep;
    const finisher = step === 2;
    this.comboStep = (step + 1) % 3;
    this.comboWindow = 0.85;

    this.cd.strike = (finisher ? CD_STRIKE * 1.8 : CD_STRIKE) * (od ? 0.72 : 1);
    this.punchT = finisher ? 0.34 : 0.24;
    this.punchSide = step;
    this.rig.playClip(step === 0 ? "jabR" : step === 1 ? "crossL" : "uppercutR", od ? 1.25 : 1);

    // aim assist
    const tgt = this.nearestEnemy(finisher ? 26 : 22, 0.05);
    if (tgt) {
      this._aim.subVectors(tgt.obj.position, this.pos).normalize();
      // magnetism step toward distant targets
      const d = tgt.obj.position.distanceTo(this.pos);
      if (d > 6) this.vel.addScaledVector(this._aim, Math.min(52, (d - 6) * 7));
    }

    const reach = finisher ? 4.0 : 3.2;
    const hitPos = this._v.copy(this.pos).addScaledVector(this._aim, reach);
    const radius = finisher ? 4.6 : 3.4;
    const dmg = (finisher ? 96 : step === 1 ? 48 : 40) * (od ? 1.95 : 1);
    let hitAny = false;

    for (const e of this.enemies.list) {
      if (e.dead || e.grabbed) continue;
      if (e.obj.position.distanceTo(hitPos) < e.r + radius) {
        hitAny = true;
        this.damageEnemy(e, dmg, true);
        if (finisher) {
          // launch them skyward
          e.v.addScaledVector(this._aim, e.kind === "boss" ? 14 : 40);
          e.v.y += e.kind === "boss" ? 18 : 74;
        } else {
          e.v.addScaledVector(this._aim, e.kind === "boss" ? 18 : 62);
        }
      }
    }

    // punch buildings
    const b = this.city.collide(hitPos, finisher ? 3.4 : 2.6, this._push);
    if (b) {
      hitAny = true;
      const before = this.city.demolished;
      this.city.damage(b, (finisher ? 190 : 76) * (od ? 1.8 : 1), hitPos, this.fx, finisher ? 40 : 26);
      if (this.city.demolished > before) this.onDemolish();
      this.vel.addScaledVector(this._aim, -12);
    }

    if (hitAny) {
      this.stopT = Math.max(this.stopT, finisher ? 0.13 : 0.075);
      this.shake = Math.max(this.shake, finisher ? 12 : 6);
      const col = finisher ? 0xffb03c : 0xfff0c0;
      this.fx.flash(hitPos.x, hitPos.y, hitPos.z, col, finisher ? 6.5 : 3.6, finisher ? 0.26 : 0.16);
      this.fx.spark(hitPos.x, hitPos.y, hitPos.z, 0xffe27a, finisher ? 46 : 22, finisher ? 40 : 26,
        finisher ? 0.7 : 0.5, finisher ? 0.6 : 0.4, -8, 1);
      this.fx.ring(hitPos.x, hitPos.y, hitPos.z, 0xffffff, finisher ? 15 : 7, finisher ? 0.4 : 0.26,
        false, finisher ? 2 : 1.2);
      if (finisher) {
        this.fx.ring(hitPos.x, hitPos.y, hitPos.z, 0xffa03c, 24, 0.55, false, 1.4);
        this.slowT = Math.max(this.slowT, 0.14);
        this.fovKick = Math.max(this.fovKick, 7);
        this.vel.y += 16;
      }
      audio.play("punch", finisher ? 1.3 : 1);
      navigator.vibrate?.(finisher ? 45 : 22);
    } else {
      audio.play("whiff");
    }
  }

  /** strike input during a dash: a heavy momentum punch that ends the dash */
  private doDashPunch(): void {
    const od = this.odT > 0;
    this.dashT = Math.max(this.dashT, 0.13);
    this.punchT = 0.2;
    this.punchSide = 0;
    this.rig.playClip("jabR", 1.7);

    const hitPos = this._v.copy(this.pos).addScaledVector(this.dashDir, 3.4);
    const dmg = od ? 110 : 62;
    let hitAny = false;
    for (const e of this.enemies.list) {
      if (e.dead || e.grabbed) continue;
      if (e.obj.position.distanceTo(hitPos) < e.r + 4.2) {
        hitAny = true;
        this.damageEnemy(e, dmg, true);
        e.v.addScaledVector(this.dashDir, 74);
        e.v.y += 22;
      }
    }
    const b = this.city.collide(hitPos, 3.4, this._push);
    if (b) {
      hitAny = true;
      const before = this.city.demolished;
      this.city.damage(b, 200 * (od ? 1.6 : 1), hitPos, this.fx, 42);
      if (this.city.demolished > before) this.onDemolish();
    }

    this.fx.flash(hitPos.x, hitPos.y, hitPos.z, 0xbfe0ff, 6, 0.24);
    this.fx.ring(hitPos.x, hitPos.y, hitPos.z, 0xffffff, 18, 0.42, false, 1.8);
    this.fx.ring(hitPos.x, hitPos.y, hitPos.z, 0x8fc4ff, 26, 0.5, false, 1.3);
    this.fx.spark(hitPos.x, hitPos.y, hitPos.z, 0xd8ecff, 34, 34, 0.6, 0.5, -8, 1);
    this.fx.jet(hitPos.x, hitPos.y, hitPos.z, -this.dashDir.x, -this.dashDir.y, -this.dashDir.z,
      0xbfe0ff, 14, 26, 0.8, 0.4, 0.3);
    this.fovKick = Math.max(this.fovKick, 9);
    this.shake = Math.max(this.shake, hitAny ? 12 : 7);
    this.stopT = Math.max(this.stopT, 0.08);
    audio.play("punch", 1.5);
    navigator.vibrate?.(40);
    if (hitAny) this.addCombo(1);
  }

  /* ---------- cyclone spin ---------- */

  private doCyclone(): void {
    const od = this.odT > 0;
    this.en -= EN_CYCLONE;
    this.cd.cyclone = CD_CYCLONE;
    this.cycloneT = od ? 1.05 : 0.9;
    this.cycloneHitT = 0;
    this.cycloneSpin = 0;
    this.iT = Math.max(this.iT, this.cycloneT + 0.15);
    audio.play("cyclone");
    this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xffd23f, 16, 0.4, false, 1.4);
    this.fx.flash(this.pos.x, this.pos.y, this.pos.z, 0xffe9b0, 4, 0.18);
    this.setMsg("CYCLONE", 0.9, "warn");
    navigator.vibrate?.(30);
  }

  private updateCyclone(dt: number): void {
    this.cycloneT -= dt;
    this.vel.multiplyScalar(Math.exp(-2.6 * dt));
    this.vel.y = lerp(this.vel.y, 4, 1 - Math.exp(-3 * dt));

    // swirling wind streaks
    if (Math.random() < dt * 60) {
      const a = Math.random() * Math.PI * 2;
      const r = 3.5 + Math.random() * 2;
      this._v2.set(
        this.pos.x + Math.cos(a) * r,
        this.pos.y + (Math.random() - 0.5) * 3,
        this.pos.z + Math.sin(a) * r,
      );
      this.fx.spark(this._v2.x, this._v2.y, this._v2.z, 0xd8ecff, 1, 12, 0.4, 0.3, 0, 1);
    }

    // damage ticks
    this.cycloneHitT -= dt;
    if (this.cycloneHitT <= 0) {
      this.cycloneHitT = 0.09;
      const od = this.odT > 0;
      for (const e of this.enemies.list) {
        if (e.dead || e.grabbed) continue;
        const d = e.obj.position.distanceTo(this.pos);
        if (d < e.r + 7) {
          this._v2.subVectors(e.obj.position, this.pos).normalize();
          e.v.addScaledVector(this._v2, 30);
          e.v.y += 12;
          this.damageEnemy(e, (od ? 40 : 22) * 0.55, true);
        }
      }
      // bat projectiles away
      for (const s of this.shots) {
        if (!s.active || !s.foe) continue;
        if (s.mesh.position.distanceTo(this.pos) < 8.5) {
          this.deflectShot(s);
        }
      }
      this.shake = Math.max(this.shake, 2.2);
    }

    if (this.cycloneT <= 0) {
      // finisher shockwave
      const od = this.odT > 0;
      this.cycloneT = 0;
      this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xffffff, 16, 0.45, false, 2);
      this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xffd23f, 26, 0.55, true, 1.6);
      this.fx.flash(this.pos.x, this.pos.y, this.pos.z, 0xffe9b0, 7, 0.24);
      this.fx.spark(this.pos.x, this.pos.y, this.pos.z, 0xffe27a, 40, 36, 0.7, 0.6, -6, 1);
      this.shake = Math.max(this.shake, 9);
      this.fovKick = Math.max(this.fovKick, 6);
      audio.play("boom", 0.9);
      navigator.vibrate?.(45);
      for (const e of this.enemies.list) {
        if (e.dead || e.grabbed) continue;
        const d = e.obj.position.distanceTo(this.pos);
        if (d < e.r + 11) {
          const k = 1 - d / (e.r + 11);
          this._v2.subVectors(e.obj.position, this.pos).normalize();
          e.v.addScaledVector(this._v2, 60 * k);
          e.v.y += 34 * k;
          this.damageEnemy(e, (od ? 68 : 36) * (0.5 + k * 0.5), true);
        }
      }
      const before = this.city.demolished;
      this.city.blast(this.pos, 14, 40, this.fx);
      if (this.city.demolished > before) this.onDemolish();
    }
  }

  private deflectShot(s: Shot): void {
    s.foe = false;
    s.dmg = 16;
    s.life = 2.2;
    s.v.multiplyScalar(-1.12);
    (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(0xbfe0ff);
    const p = s.mesh.position;
    this.fx.spark(p.x, p.y, p.z, 0xbfe0ff, 10, 14, 0.4, 0.3, 0, 1);
    this.fx.flash(p.x, p.y, p.z, 0xd8ecff, 2, 0.1);
    audio.play("deflect");
    this.addOd(4);
    this.addCombo(1);
  }

  /* ---------- grab & throw / thunder clap ---------- */

  private doGrabOrClap(): void {
    if (this.grabbed) { this.doThrow(); return; }
    if (this.clapT > 0) return;

    // find a grabbable target in front
    let best: Enemy | null = null;
    let bestD = 15;
    for (const e of this.enemies.list) {
      if (e.dead || e.grabbed || e.thrown > 0 || e.kind === "boss" || e.kind === "mech") continue;
      const d = e.obj.position.distanceTo(this.pos);
      if (d < bestD) { best = e; bestD = d; }
    }

    if (best) {
      this.grabbed = best;
      best.grabbed = true;
      best.v.set(0, 0, 0);
      this.grabT = 5;
      this._aim.subVectors(best.obj.position, this.pos).normalize();
      this.rig.playClip("grabSnatch");
      const p = best.obj.position;
      this.fx.ring(p.x, p.y, p.z, 0xffd23f, 9, 0.3, false, 1.4);
      this.fx.spark(p.x, p.y, p.z, 0xffe27a, 14, 14, 0.4, 0.3, 0, 1);
      audio.play("grapple", 1);
      navigator.vibrate?.(25);
      this.setMsg("GRABBED — THROW (G) · PILE-DRIVE (L)", 1.6, "info");
    } else {
      // nothing to grab → THUNDER CLAP
      this.clapT = 0.42;
      this.clapFired = false;
      this.rig.playClip("clapHit");
      audio.play("warn", 0.4);
    }
  }

  private updateGrab(dt: number): void {
    const g = this.grabbed;
    if (!g) return;
    if (g.dead) { this.grabbed = null; return; }
    this.grabT -= dt;

    // hold the victim out in front — or underneath during a pile-driver
    if (this.slamPhase === "pdRise" || this.slamPhase === "pdDive") {
      this._v2.copy(this.pos);
      this._v2.y -= 1.9 + g.r * 0.5;
      g.obj.position.lerp(this._v2, Math.min(1, dt * 20));
    } else {
      this._v2.copy(this.pos)
        .addScaledVector(this._aim, 3.4 + g.r * 0.6);
      this._v2.y += 0.6;
      g.obj.position.lerp(this._v2, Math.min(1, dt * 16));
    }
    g.v.set(0, 0, 0);

    if (Math.random() < dt * 22) {
      const p = g.obj.position;
      this.fx.spark(p.x, p.y, p.z, 0xffd23f, 1, 5, 0.35, 0.35, 0, 1);
    }
    if (this.grabT <= 0) this.doThrow();
  }

  private doThrow(): void {
    const g = this.grabbed;
    if (!g) return;
    this.grabbed = null;
    g.grabbed = false;
    g.thrown = 3.2;
    this.throwT = 0.3;
    this.comboWindow = 0;
    this.rig.playClip("throwHit");

    const speed = this.odT > 0 ? 200 : 155;
    g.v.copy(this._aim).multiplyScalar(speed);
    g.v.y += 8;
    g.tumble.set(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14,
    );
    const p = g.obj.position;
    this.fx.ring(p.x, p.y, p.z, 0xffd23f, 14, 0.35, false, 1.5);
    this.fx.spark(p.x, p.y, p.z, 0xffe27a, 22, 26, 0.5, 0.4, 0, 1);
    this.vel.addScaledVector(this._aim, -8);
    this.shake = Math.max(this.shake, 5);
    audio.play("dash", 0.8);
    navigator.vibrate?.(35);
    this.addCombo(1);
  }

  /** radial airburst that staggers everything and shatters nearby facades */
  private thunderClap(): void {
    const od = this.odT > 0;
    const p = this.pos.clone();
    const R = od ? 40 : 30;

    this.fx.ring(p.x, p.y, p.z, 0xffffff, R * 1.5, 0.5, false, 2.2);
    this.fx.ring(p.x, p.y, p.z, 0xbfe0ff, R, 0.42, false, 1.6);
    this.fx.ring(p.x, p.y, p.z, 0xffd23f, R * 0.6, 0.32, false, 1.2);
    this.fx.flash(p.x, p.y, p.z, 0xe8f4ff, R * 0.34, 0.24);
    this.fx.spark(p.x, p.y, p.z, 0xdcefff, 46, 42, 0.6, 0.6, -4, 1);
    this.shake = Math.max(this.shake, 11);
    this.slowT = Math.max(this.slowT, 0.12);
    audio.play("boom", 1.1);
    navigator.vibrate?.(50);

    for (const e of this.enemies.list) {
      if (e.dead || e.grabbed) continue;
      const d = e.obj.position.distanceTo(p);
      if (d < R + e.r) {
        const k = 1 - d / (R + e.r);
        this._v2.subVectors(e.obj.position, p).normalize();
        e.v.addScaledVector(this._v2, 90 * k);
        this.damageEnemy(e, (od ? 70 : 42) * (0.45 + k), true);
      }
    }
    const before = this.city.demolished;
    this.city.blast(p, R * 0.7, od ? 110 : 68, this.fx);
    const n = this.city.demolished - before;
    if (n > 0) { this.score += n * 240; this.addCombo(n); }
  }

  private doBlast(): void {
    const od = this.odT > 0;
    this.en -= EN_BLAST;
    this.cd.blast = CD_BLAST * (od ? 0.7 : 1);
    this.blastT = 0.18;
    this.rig.playClip("blastFire", 1.3);

    const tgt = this.nearestEnemy(140, 0.35);
    this._v2.copy(this._aim);
    if (tgt) {
      this._v2.subVectors(tgt.obj.position, this.pos).normalize();
      // small lead
      this._v2.addScaledVector(tgt.v, 0.006).normalize();
    }
    const muzzle = this._v.copy(this.pos).addScaledVector(this._v2, 2.2);
    muzzle.y += 0.4;
    this.spawnShot(muzzle, this._v2, 190, od ? 40 : 21, 0xffd23f, 0.5, false);
    if (od) {
      // overdrive: twin bolts
      this._v.copy(this._v2).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.06);
      const m2 = this._v.clone().multiplyScalar(2.2).add(this.pos);
      this.spawnShot(m2, this._v, 190, 34, 0xffa03c, 0.42, false);
    }
    this.fx.jet(muzzle.x, muzzle.y, muzzle.z, this._v2.x, this._v2.y, this._v2.z,
      0xffe27a, 7, 22, 0.45, 0.3, 0.2);
    this.fx.flash(muzzle.x, muzzle.y, muzzle.z, 0xffe9a0, 2, 0.1);
    this.vel.addScaledVector(this._v2, -3.2);
    audio.play("zap");
  }

  private doDash(): void {
    this.en -= EN_DASH;
    this.cd.dash = CD_DASH;
    this.dashT = 0.3;
    this.dashId = this.enemies.markDash();
    this.dashDir.copy(this._aim).normalize();
    this.iT = Math.max(this.iT, 0.42);
    this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xd8ecff, 22, 0.45, false, 1.6);
    this.fx.flash(this.pos.x, this.pos.y, this.pos.z, 0xbfe0ff, 5, 0.2);
    this.shake = Math.max(this.shake, 4);
    audio.play("dash");
    navigator.vibrate?.(18);
  }

  private startSlam(): void {
    this.en -= EN_SLAM;
    this.cd.slam = CD_SLAM;
    this.slamPhase = "rise";
    this.slamT = 0.42;
    this.iT = Math.max(this.iT, 0.3);
    audio.play("warn", 0.6);
    this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xffd23f, 12, 0.4, false, 1.4);
  }

  /** pile-driver: rocket skyward with a grabbed enemy, then drive them into the pavement */
  private startPiledrive(): void {
    const g = this.grabbed;
    if (!g) return;
    this.cd.slam = CD_SLAM;
    this.slamPhase = "pdRise";
    this.slamT = 0.5;
    this.iT = Math.max(this.iT, 0.5);
    this.setMsg("PILE-DRIVER!", 1, "warn");
    audio.play("grapple", 1.2);
    audio.play("dash", 0.7);
    this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xff5a6e, 14, 0.4, false, 1.4);
  }

  private updateSlam(dt: number): void {
    this.slamT -= dt;
    if (this.slamPhase === "rise") {
      this.vel.set(this.vel.x * 0.9, 62, this.vel.z * 0.9);
      this.fx.jet(this.pos.x, this.pos.y - 1, this.pos.z, 0, -1, 0, 0xffd23f, 3, 14, 0.6, 0.35, 0.3);
      if (this.slamT <= 0) {
        this.slamPhase = "dive";
        this.slamT = 1.6;
        this.vel.set(0, -175, 0);
        audio.play("dash", 0.8);
      }
    } else if (this.slamPhase === "dive") {
      this.vel.set(this.vel.x * 0.92, -175, this.vel.z * 0.92);
      this.fx.jet(this.pos.x, this.pos.y, this.pos.z, 0, 1, 0, 0xffb04a, 4, 24, 0.9, 0.4, 0.34);
      const surf = this.city.surfaceY(this.pos.x, this.pos.z);
      if (this.pos.y <= surf + 2.2 || this.slamT <= 0) {
        this.pos.y = Math.max(surf + 1.4, this.pos.y);
        this.slamImpact();
      }
    } else if (this.slamPhase === "pdRise") {
      this.vel.set(this.vel.x * 0.86, 88, this.vel.z * 0.86);
      this.fx.jet(this.pos.x, this.pos.y - 1, this.pos.z, 0, -1, 0, 0xff5a6e, 3, 16, 0.7, 0.35, 0.3);
      if (this.slamT <= 0 || this.pos.y > 240) {
        this.slamPhase = "pdDive";
        this.slamT = 2.0;
        this.vel.set(0, -195, 0);
        audio.play("dash", 1);
        this.setMsg("!!", 0.4, "warn");
      }
    } else if (this.slamPhase === "pdDive") {
      this.vel.set(this.vel.x * 0.9, -195, this.vel.z * 0.9);
      const g = this.grabbed;
      if (g) {
        const p = g.obj.position;
        this.fx.jet(p.x, p.y, p.z, 0, 1, 0, 0xff6a5a, 3, 18, 0.8, 0.4, 0.3);
      }
      const surf = this.city.surfaceY(this.pos.x, this.pos.z);
      if (this.pos.y <= surf + 2.4 || this.slamT <= 0) {
        this.pos.y = Math.max(surf + 1.4, this.pos.y);
        this.piledriveImpact();
      }
    }
  }

  private piledriveImpact(): void {
    const od = this.odT > 0;
    this.slamPhase = "none";
    this.vel.set(0, 8, 0);
    const p = this.pos.clone();
    const R = od ? 40 : 32;

    // the victim eats the pavement
    const g = this.grabbed;
    if (g && !g.dead) {
      g.grabbed = false;
      g.obj.position.set(p.x, p.y - 1.5, p.z);
      this.damageEnemy(g, od ? 620 : 420, true);
      if (!g.dead) { g.v.set(0, 46, 0); g.tumble.set(6, 3, 6); }
    }
    this.grabbed = null;
    this.rig.playClip("slamLand");

    this.fx.ring(p.x, p.y + 0.5, p.z, 0xff5a6e, R * 1.5, 0.65, true, 2.2);
    this.fx.ring(p.x, p.y + 0.5, p.z, 0xffffff, R, 0.5, true, 1.5);
    this.fx.flash(p.x, p.y + 2, p.z, 0xff9a6a, R * 0.5, 0.3);
    this.fx.spark(p.x, p.y + 1, p.z, 0xffe27a, 54, 44, 0.8, 0.8, -24, 0.6);
    this.fx.smoke(p.x, p.y + 1, p.z, 22, 18, 5, 0xa1959a, 3.2);
    this.city.spawnDebris(p.x, p.y + 1, p.z, 16, 28, 5);
    this.shake = Math.max(this.shake, 15);
    this.slowT = Math.max(this.slowT, 0.24);
    this.fovKick = Math.max(this.fovKick, 8);
    audio.play("slam");
    navigator.vibrate?.(80);

    const before = this.city.demolished;
    this.city.blast(p, R, od ? 190 : 140, this.fx);
    const n = this.city.demolished - before;
    if (n > 0) { this.score += n * 260; this.addCombo(n); }

    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const d = e.obj.position.distanceTo(p);
      if (d < R + e.r) {
        const k = 1 - d / (R + e.r);
        this._v2.subVectors(e.obj.position, p).normalize();
        e.v.addScaledVector(this._v2, 60 * k);
        e.v.y += 24 * k;
        this.damageEnemy(e, (od ? 120 : 74) * (0.4 + k), true);
      }
    }
  }

  private slamImpact(): void {
    const od = this.odT > 0;
    this.slamPhase = "none";
    this.vel.set(0, 8, 0);
    this.rig.playClip("slamLand");
    const p = this.pos.clone();
    const R = od ? 58 : 44;

    this.fx.ring(p.x, p.y + 0.5, p.z, 0xffd23f, R * 1.7, 0.72, true, 2.4);
    this.fx.ring(p.x, p.y + 0.5, p.z, 0xffffff, R, 0.5, true, 1.6);
    this.fx.ring(p.x, p.y + 2, p.z, 0xff9a4a, R * 1.2, 0.85, false, 1.6);
    this.fx.flash(p.x, p.y + 2, p.z, 0xffd08a, R * 0.5, 0.32);
    this.fx.spark(p.x, p.y + 1, p.z, 0xffe27a, 60, 46, 0.85, 0.85, -26, 0.55);
    this.fx.smoke(p.x, p.y + 1, p.z, 26, 20, 5, 0xa1959a, 3.4);
    this.city.spawnDebris(p.x, p.y + 1, p.z, 20, 30, 6);

    this.shake = Math.max(this.shake, 18);
    this.slowT = Math.max(this.slowT, 0.26);
    this.fovKick = Math.max(this.fovKick, 9);
    audio.play("slam");
    navigator.vibrate?.(70);

    // level the neighbourhood
    const before = this.city.demolished;
    this.city.blast(p, R, od ? 220 : 150, this.fx);
    const n = this.city.demolished - before;
    if (n > 0) {
      this.score += n * 260;
      this.addCombo(n);
      this.setMsg(`${n} STRUCTURE${n > 1 ? "S" : ""} LEVELED`, 1.6, "warn");
    }

    // damage enemies in radius
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      const d = e.obj.position.distanceTo(p);
      if (d < R + e.r) {
        const k = 1 - d / (R + e.r);
        this._v2.subVectors(e.obj.position, p).normalize();
        e.v.addScaledVector(this._v2, 70 * k);
        e.v.y += 26 * k;
        this.damageEnemy(e, (od ? 150 : 90) * (0.4 + k), true);
      }
    }
  }

  private triggerOverdrive(): void {
    this.odT = 8;
    audio.play("over");
    this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xffd23f, 34, 0.8, false, 2.4);
    this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xff7a3c, 22, 0.6, false, 1.6);
    this.fx.flash(this.pos.x, this.pos.y, this.pos.z, 0xffc060, 9, 0.4);
    this.fx.spark(this.pos.x, this.pos.y, this.pos.z, 0xffd23f, 60, 34, 0.8, 0.9, 6, 1);
    this.shake = Math.max(this.shake, 9);
    this.fovKick = Math.max(this.fovKick, 6);
    this.setMsg("VILTRUMITE OVERDRIVE — DAMAGE ×2", 2.2, "warn");
    navigator.vibrate?.(60);
  }

  private enemySlam(at: THREE.Vector3, radius: number, dmg: number): void {
    this.fx.ring(at.x, at.y + 0.5, at.z, 0xff4757, radius * 1.7, 0.75, true, 2.2);
    this.fx.ring(at.x, at.y + 1, at.z, 0xffffff, radius, 0.5, true, 1.4);
    this.fx.flash(at.x, at.y + 2, at.z, 0xff7a5a, radius * 0.4, 0.3);
    this.fx.spark(at.x, at.y + 1, at.z, 0xff8a6a, 44, 40, 0.8, 0.8, -24, 0.6);
    this.fx.smoke(at.x, at.y + 1, at.z, 20, 18, 5, 0x9c9098, 3.2);
    this.city.blast(at, radius, 120, this.fx);
    const d = this.pos.distanceTo(at);
    if (d < radius) this.damagePlayer(dmg * (1 - d / radius) + 6, at);
  }

  /* ---------------- projectiles ---------------- */

  private spawnShot(
    from: THREE.Vector3, dir: THREE.Vector3, speed: number,
    dmg: number, color: number, radius: number, foe = false,
  ): void {
    const s = this.shots.find((q) => !q.active);
    if (!s) return;
    s.active = true;
    s.foe = foe;
    s.dmg = dmg;
    s.r = radius;
    s.life = foe ? 3.4 : 2.2;
    s.mesh.visible = true;
    s.mesh.position.copy(from);
    s.mesh.scale.setScalar(radius);
    (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    s.v.copy(dir).multiplyScalar(speed);
  }

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      if (!s.active) continue;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.v, dt);
      const p = s.mesh.position;
      // stretch along travel
      s.mesh.scale.set(s.r, s.r, s.r * (1 + Math.min(3.2, s.v.length() * 0.014)));
      s.mesh.lookAt(this._v.copy(p).add(s.v));

      if (Math.random() < dt * 40) {
        this.fx.spark(p.x, p.y, p.z,
          (s.mesh.material as THREE.MeshBasicMaterial).color.getHex(), 1, 2, s.r * 0.8, 0.22, 0, 1);
      }

      let done = s.life <= 0;

      if (!done && !s.foe) {
        for (const e of this.enemies.list) {
          if (e.dead) continue;
          if (p.distanceTo(e.obj.position) < e.r + s.r + 0.6) {
            this.damageEnemy(e, s.dmg, false);
            this.fx.spark(p.x, p.y, p.z, 0xffe27a, 12, 16, 0.4, 0.3, 0, 1);
            this.fx.flash(p.x, p.y, p.z, 0xfff0c0, 2, 0.12);
            audio.play("punch", 0.35);
            done = true;
            break;
          }
        }
      } else if (!done && s.foe && !this.heroDead) {
        if (p.distanceTo(this.pos) < 1.9 + s.r) {
          if (this.blockT > 0.55) {
            // braced — deflect it straight back at the shooter
            this.deflectShot(s);
          } else {
            this.damagePlayer(s.dmg, p);
            done = true;
          }
        }
      }

      // building hit
      if (!done) {
        const b = this.city.collide(p, s.r + 0.4, this._push);
        if (b) {
          const before = this.city.demolished;
          this.city.damage(b, s.foe ? 14 : s.dmg * 0.9, p, this.fx, 12);
          if (!s.foe && this.city.demolished > before) this.onDemolish();
          this.fx.spark(p.x, p.y, p.z, 0xffc27a, 10, 14, 0.4, 0.3, -6, 1);
          done = true;
        } else if (p.y < 0.5) {
          this.fx.spark(p.x, 0.6, p.z, 0xffc27a, 8, 12, 0.4, 0.3, -6, 0.4);
          this.fx.smoke(p.x, 0.8, p.z, 3, 5, 1.2, 0x9a9098, 1.2);
          done = true;
        }
      }

      if (done) {
        s.active = false;
        s.mesh.visible = false;
      }
    }
  }

  /* ---------------- bombs ---------------- */

  dropBomb(from: THREE.Vector3, vel: THREE.Vector3): void {
    const b = this.bombs.find((q) => !q.active);
    if (!b) return;
    b.active = true;
    b.life = 7;
    b.mesh.visible = true;
    b.mesh.position.copy(from);
    b.mesh.rotation.set(Math.random(), Math.random(), Math.random());
    b.v.copy(vel);
  }

  private updateBombs(dt: number): void {
    for (const b of this.bombs) {
      if (!b.active) continue;
      b.life -= dt;
      b.v.y -= 46 * dt;
      b.v.multiplyScalar(Math.exp(-0.12 * dt));
      b.mesh.position.addScaledVector(b.v, dt);
      // align to fall direction
      b.mesh.rotation.x = lerp(b.mesh.rotation.x, Math.PI, Math.min(1, dt * 3));
      const p = b.mesh.position;

      // whistle trail
      if (Math.random() < dt * 30) {
        this.fx.spark(p.x, p.y, p.z, 0xff8a5a, 1, 2, 0.3, 0.22, 0, 1);
        this.fx.smoke(p.x, p.y, p.z, 1, 2, 0.8, 0x8f8490, 0.8);
      }

      let hit = b.life <= 0;
      if (!hit) {
        const bl = this.city.collide(p, 0.7, this._push);
        if (bl) hit = true;
        else if (p.y < 0.6) { p.y = 0.6; hit = true; }
      }
      if (hit) {
        b.active = false;
        b.mesh.visible = false;
        // detonation — flattens the block around it
        const R = 24;
        this.fx.ring(p.x, 1, p.z, 0xffa03c, R * 1.6, 0.6, true, 1.8);
        this.fx.ring(p.x, 1.4, p.z, 0xffffff, R, 0.4, true, 1.2);
        this.fx.flash(p.x, p.y + 1, p.z, 0xffb06a, 9, 0.28);
        this.fx.spark(p.x, p.y + 1, p.z, 0xffb054, 42, 34, 0.7, 0.6, -18, 0.7);
        this.fx.smoke(p.x, p.y + 1, p.z, 18, 14, 4.5, 0x8f8490, 3);
        this.city.spawnDebris(p.x, p.y, p.z, 10, 20, 4);
        this.city.blast(p, R, 130, this.fx);
        this.shake = Math.max(this.shake, 7);
        audio.play("boom", 0.85);
        const d = this.pos.distanceTo(p);
        if (d < 18) this.damagePlayer(22 * (1 - d / 18), p);
      }
    }
  }

  /* ---------------- orbs ---------------- */

  private spawnOrb(at: THREE.Vector3, kind: "hp" | "en"): void {
    const o = this.orbs.find((q) => !q.active);
    if (!o) return;
    o.active = true;
    o.kind = kind;
    o.t = 0;
    o.mesh.visible = true;
    o.mesh.position.copy(at);
    o.v.set((Math.random() - 0.5) * 10, 6, (Math.random() - 0.5) * 10);
    const m = o.mesh.material as THREE.MeshStandardMaterial;
    const c = kind === "hp" ? 0x7dff9e : 0x6ecbff;
    m.color.setHex(c);
    m.emissive.setHex(c);
  }

  private updateOrbs(dt: number): void {
    for (const o of this.orbs) {
      if (!o.active) continue;
      o.t += dt;
      const d = o.mesh.position.distanceTo(this.pos);
      if (d < 26 && !this.heroDead) {
        this._v2.subVectors(this.pos, o.mesh.position).normalize();
        o.v.addScaledVector(this._v2, 150 * dt);
      } else {
        o.v.y -= 12 * dt;
      }
      o.v.multiplyScalar(Math.exp(-0.9 * dt));
      o.mesh.position.addScaledVector(o.v, dt);
      o.mesh.rotation.y += dt * 2.4;
      o.mesh.rotation.x += dt * 1.5;
      const surf = this.city.surfaceY(o.mesh.position.x, o.mesh.position.z);
      if (o.mesh.position.y < surf + 1) {
        o.mesh.position.y = surf + 1;
        o.v.y = Math.abs(o.v.y) * 0.4;
      }
      if (d < 2.6 && !this.heroDead) {
        if (o.kind === "hp") this.hp = Math.min(100, this.hp + 16);
        else this.en = Math.min(100, this.en + 30);
        this.fx.flash(o.mesh.position.x, o.mesh.position.y, o.mesh.position.z,
          o.kind === "hp" ? 0x7dff9e : 0x6ecbff, 3, 0.25);
        audio.play("pickup");
        o.active = false;
        o.mesh.visible = false;
        continue;
      }
      if (o.t > 20) { o.active = false; o.mesh.visible = false; }
    }
  }

  /** hurled enemies act as wrecking balls until they hit something */
  private updateThrown(dt: number): void {
    for (const e of this.enemies.list) {
      if (e.dead || e.thrown <= 0) continue;
      const p = e.obj.position;
      let impact = false;

      // building hit
      const b = this.city.collide(p, e.r + 1, this._push);
      if (b) {
        impact = true;
        const before = this.city.demolished;
        this.city.smashThrough(p, e.r + 3, this.fx, 26);
        this.city.damage(b, 150, p, this.fx, 34);
        if (this.city.demolished > before) this.onDemolish();
      }
      // ground hit
      if (!impact && p.y <= this.city.surfaceY(p.x, p.z) + e.r) {
        impact = true;
        this.fx.ring(p.x, p.y + 0.4, p.z, 0xffd2a0, 20, 0.5, true, 1.4);
        this.city.spawnDebris(p.x, p.y, p.z, 8, 16, 3);
      }
      // slammed into another enemy
      if (!impact) {
        for (const o of this.enemies.list) {
          if (o === e || o.dead || o.grabbed || o.thrown > 0) continue;
          if (o.obj.position.distanceTo(p) < o.r + e.r + 0.8) {
            impact = true;
            this.damageEnemy(o, 90, true);
            o.v.addScaledVector(e.v, 0.22);
            break;
          }
        }
      }

      if (impact || e.thrown <= 0) {
        e.thrown = 0;
        this.fx.flash(p.x, p.y, p.z, 0xffc070, 6, 0.22);
        this.fx.spark(p.x, p.y, p.z, 0xffb054, 30, 30, 0.6, 0.5, -10, 1);
        this.shake = Math.max(this.shake, 8);
        audio.play("boom", 0.9);
        this.damageEnemy(e, 130, true);
      }
      void dt;
    }
  }

  /* ---------------- damage ---------------- */

  private damageEnemy(e: Enemy, dmg: number, combo: boolean): void {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.1;
    this.addOd(dmg * 0.35);
    if (combo) this.addCombo(1);
    const p = e.obj.position;
    this.fx.spark(p.x, p.y, p.z, 0xffd9a0, 6, 12, 0.35, 0.28, -3, 1);
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    // seed the wreck tumble
    e.wreckSpin.set(
      (Math.random() - 0.5) * 9,
      (Math.random() - 0.5) * 7,
      (Math.random() - 0.5) * 9,
    );
    if (this.grabbed === e) { this.grabbed = null; e.grabbed = false; }
    this.kills++;
    this.addCombo(1);
    const base =
      e.kind === "boss" ? 2400 :
        e.kind === "mech" ? 420 :
          e.kind === "bomber" ? 260 :
            e.kind === "gunship" ? 220 :
              e.kind === "raptor" ? 130 :
                e.kind === "seeker" ? 60 : 90;
    const pts = Math.round(base * (1 + Math.min(40, this.combo) * 0.05));
    this.score += pts;
    this.addOd(7);

    const p = e.obj.position;
    const col =
      e.kind === "boss" ? 0xff4757 :
        e.kind === "mech" ? 0xff8a3c :
          e.kind === "bomber" ? 0xffb054 :
            e.kind === "gunship" ? 0xffb054 :
              e.kind === "raptor" ? 0xff6b7a :
                e.kind === "seeker" ? 0x7ae0ff : 0x7ae0ff;
    const big = e.kind === "boss" || e.kind === "mech";
    const mid = e.kind === "gunship" || e.kind === "bomber";
    this.fx.spark(p.x, p.y, p.z, col, big ? 90 : mid ? 54 : 34, big ? 60 : 36, big ? 1.1 : 0.7, big ? 1.1 : 0.6, -14, 1);
    this.fx.spark(p.x, p.y, p.z, 0xffffff, 18, 26, 0.5, 0.4, -6, 1);
    this.fx.flash(p.x, p.y, p.z, col, big ? 22 : 7, big ? 0.5 : 0.26);
    this.fx.ring(p.x, p.y, p.z, col, big ? 70 : 18, big ? 0.9 : 0.45, false, big ? 2.4 : 1.2);
    this.fx.smoke(p.x, p.y, p.z, big ? 30 : 10, big ? 16 : 9, big ? 6 : 2.6, 0x8f8490, big ? 4 : 2.2);
    this.city.spawnDebris(p.x, p.y, p.z, big ? 22 : 6, big ? 26 : 14, big ? 5 : 2.4);
    this.shake = Math.max(this.shake, big ? 20 : 4.5);
    audio.play("explode", big ? 1.4 : 0.8);

    if (e.kind === "boss") {
      this.slowT = Math.max(this.slowT, 1.0);
      this.score += this.wave * 200;
      this.setMsg("WARLORD DOWN — THE CITY HOLDS", 3, "info");
      for (let i = 0; i < 5; i++) {
        this._v2.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 16, Math.random() * 8, (Math.random() - 0.5) * 16));
        this.spawnOrb(this._v2, i % 2 === 0 ? "hp" : "en");
      }
    } else if (e.kind === "mech" || e.kind === "bomber") {
      this.slowT = Math.max(this.slowT, 0.22);
      for (let i = 0; i < 3; i++) {
        this._v2.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8));
        this.spawnOrb(this._v2, i % 2 === 0 ? "hp" : "en");
      }
    } else if (Math.random() < 0.3) {
      this.spawnOrb(p, Math.random() < 0.45 ? "hp" : "en");
    }
  }

  private damagePlayer(dmg: number, from: THREE.Vector3): void {
    if (this.heroDead || this.iT > 0 || this.dashT > 0) return;
    const od = this.odT > 0;
    const braced = this.blockT > 0.55;
    let final = Math.round(dmg * (od ? 0.55 : 1) * (braced ? 0.22 : 1));
    if (final <= 0) final = 1;
    this.hp -= final;
    this.iT = braced ? 0.5 : 0.95;
    this.hurtT = braced ? 0.12 : 0.35;
    this.regenT = 5;
    if (!braced) this.combo = 0;
    this._v2.subVectors(this.pos, from).normalize();
    this.vel.addScaledVector(this._v2, braced ? 10 : 42);
    this.hud.hurt = 1;
    this.shake = Math.max(this.shake, braced ? 3 : 8);
    this.fx.spark(this.pos.x, this.pos.y, this.pos.z, braced ? 0x6ecbff : 0xff5a6e, braced ? 10 : 20, 22, 0.5, 0.4, -4, 1);
    audio.play(braced ? "deflect" : "hit");
    navigator.vibrate?.(braced ? 12 : 40);
    this.addOd(8);

    if (this.hp <= 0) {
      this.hp = 0;
      this.heroDead = true;
      this.deadT = 2.2;
      if (this.grabbed) { this.grabbed.grabbed = false; this.grabbed = null; }
      this.slowT = Math.max(this.slowT, 1.0);
      this.shake = 20;
      this.fx.flash(this.pos.x, this.pos.y, this.pos.z, 0xffd23f, 14, 0.6);
      this.fx.spark(this.pos.x, this.pos.y, this.pos.z, 0xffd23f, 70, 46, 1, 1, -10, 1);
      this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xffffff, 46, 0.9, false, 2);
      audio.play("boom");
    }
  }

  private onDemolish(): void {
    this.score += 220;
    this.addCombo(1);
  }

  private addCombo(n: number): void {
    this.combo += n;
    this.comboT = 4;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
  }

  private addOd(v: number): void {
    if (this.odT > 0) return;
    this.od = clamp(this.od + v, 0, 100);
  }

  private setMsg(msg: string, dur: number, kind: "info" | "warn"): void {
    this.hud.msg = msg;
    this.hud.msgT = dur;
    this.hud.msgKind = kind;
  }

  /* ---------------- waves ---------------- */

  private updateWaves(dt: number): void {
    const alive = this.enemies.list.length;
    if (this.wave === 0 || (this.spawned >= this.quota && alive === 0)) {
      this.betweenT -= dt;
      if (this.betweenT <= 0) {
        this.betweenT = 3.2;
        this.startWave(this.wave + 1);
      }
      return;
    }
    if (this.spawned < this.quota) {
      this.spawnT -= dt;
      const cap = Math.min(4 + this.wave, 10);
      if (this.spawnT <= 0 && alive < cap) {
        this.spawnT = Math.max(0.5, 1.4 - this.wave * 0.07);
        this.spawnWaveEnemy();
      }
    }
  }

  private startWave(n: number): void {
    this.wave = n;
    this.spawned = 0;
    const boss = n % 5 === 0;
    this.quota = boss ? 1 : Math.min(22, 4 + Math.round(n * 1.5));
    this.spawnT = boss ? 1.4 : 0.6;
    if (boss) {
      this.setMsg("WARNING — VILTRUMITE SIGNATURE INBOUND", 3, "warn");
      audio.play("warn");
      this.slowT = Math.max(this.slowT, 0.6);
    } else {
      this.setMsg(`WAVE ${n}`, 2, "info");
      audio.play("wave", 0.8);
      if (n > 1) {
        this.hp = Math.min(100, this.hp + 16);
        this.score += 180 * (n - 1);
      }
    }
  }

  private spawnWaveEnemy(): void {
    this.spawned++;
    const n = this.wave;
    if (n % 5 === 0) { this.spawnAt("boss"); return; }
    const roll = Math.random();
    const list = this.enemies.list;
    const count = (k: EKind) => list.filter((e) => e.kind === k).length;
    let kind: EKind = "drone";
    if (n >= 6 && roll > 0.9 && count("mech") < 1) kind = "mech";
    else if (n >= 4 && roll > 0.82 && count("bomber") < 2) kind = "bomber";
    else if (n >= 3 && roll > 0.72 && count("gunship") < 2) kind = "gunship";
    else if (n >= 2 && roll > 0.52 && count("raptor") < 3) kind = "raptor";
    else if (roll > 0.3) kind = "seeker";
    this.spawnAt(kind);
  }

  private spawnAt(kind: EKind): void {
    const a = Math.random() * Math.PI * 2;
    const dist = kind === "boss" ? 62 : kind === "mech" ? 90 : 70 + Math.random() * 50;
    const p = new THREE.Vector3(
      this.pos.x + Math.cos(a) * dist,
      0,
      this.pos.z + Math.sin(a) * dist,
    );
    p.x = clamp(p.x, -CITY_HALF, CITY_HALF);
    p.z = clamp(p.z, -CITY_HALF, CITY_HALF);
    const surf = this.city.surfaceY(p.x, p.z);
    p.y = Math.max(surf + 14, this.pos.y + (Math.random() - 0.3) * 30);
    if (kind === "bomber") p.y = Math.max(p.y, surf + 60);
    p.y = clamp(p.y, 16, MAX_ALT - 30);

    const hpMult = 1 + this.wave * 0.1;
    const e = this.enemies.spawn(kind, p, hpMult);

    const col =
      kind === "boss" ? 0xff4757 :
        kind === "mech" ? 0xff8a3c :
          kind === "bomber" ? 0xffb054 :
            kind === "raptor" ? 0xff6b7a : 0x7ae0ff;
    this.fx.ring(p.x, p.y, p.z, col, kind === "boss" ? 30 : 12, 0.6, false, 1.4);
    if (kind === "boss") {
      this.fx.flash(p.x, p.y, p.z, 0xff4757, 14, 0.5);
      audio.play("roar");
      this.shake = Math.max(this.shake, 10);
      navigator.vibrate?.(120);
    } else if (kind === "mech") {
      this.fx.flash(p.x, p.y, p.z, 0xff8a3c, 9, 0.4);
      audio.play("roar", 0.6);
      this.shake = Math.max(this.shake, 5);
      this.setMsg("SIEGE MECH INBOUND — HEAVY ARMOUR", 1.8, "warn");
    } else if (kind === "bomber") {
      this.setMsg("BOMBER SIGHTED — STOP IT BEFORE IT FLATTENS A BLOCK", 1.8, "warn");
    }
    void e;
  }

  /* ---------------- camera ---------------- */

  private updateCamera(raw: number, loose: boolean): void {
    const speed = this.vel.length();
    const flat = Math.hypot(this.vel.x, this.vel.z);

    // camera yaw trails the hero's heading
    if (!loose && flat > 4) {
      const travel = Math.atan2(this.vel.x, this.vel.z);
      this.camYaw = lerpAngle(this.camYaw, travel, 1 - Math.exp(-2.6 * raw));
    } else if (!loose) {
      this.camYaw = lerpAngle(this.camYaw, this.yaw, 1 - Math.exp(-1.2 * raw));
    }

    const back = 11 + clamp(speed * 0.075, 0, 8) + (this.dashT > 0 ? 3.5 : 0);
    const up = 3.6 + clamp(speed * 0.012, 0, 2.4);
    this._fwd.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));

    this.camPos.set(
      this.pos.x - this._fwd.x * back,
      this.pos.y + up,
      this.pos.z - this._fwd.z * back,
    );
    // keep the camera above the street and out of geometry
    const camSurf = this.city.surfaceY(this.camPos.x, this.camPos.z);
    if (this.camPos.y < camSurf + 3) this.camPos.y = camSurf + 3;

    const follow = this.heroDead ? 2.2 : 7.5;
    this.camera.position.lerp(this.camPos, 1 - Math.exp(-follow * raw));

    // avoid clipping inside buildings
    if (this.city.collide(this.camera.position, 2.4, this._push)) {
      this.camera.position.add(this._push);
    }

    // look slightly ahead of the hero
    this._v2.copy(this.pos);
    this._v2.y += 1.4;
    this._v2.addScaledVector(this._fwd, 7 + clamp(speed * 0.05, 0, 7));
    this.camLook.lerp(this._v2, 1 - Math.exp(-9 * raw));
    this.camera.lookAt(this.camLook);

    // shake
    if (this.shake > 0.05) {
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s * 0.32;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.32;
      this.camera.position.z += (Math.random() - 0.5) * s * 0.32;
      this.camera.rotateZ((Math.random() - 0.5) * s * 0.004);
    }

    // roll the camera slightly with the hero's bank
    this.camera.rotateZ(-this.roll * 0.22);

    // speed FOV + impact kick
    this.fovKick *= Math.exp(-5 * raw);
    const fovT = 62 + clamp((speed - 30) / 140, 0, 1) * 26 + (this.dashT > 0 ? 8 : 0) + this.fovKick;
    this.camera.fov = lerp(this.camera.fov, fovT, 1 - Math.exp(-4 * raw));
    this.camera.updateProjectionMatrix();
  }

  /* ---------------- hud ---------------- */

  private syncHud(): void {
    const h = this.hud;
    h.hp = Math.max(0, this.hp);
    h.en = this.en;
    h.od = this.odT > 0 ? (this.odT / 8) * 100 : this.od;
    h.odT = this.odT;
    h.score = this.score;
    h.wave = this.wave;
    h.combo = this.combo;
    h.comboT = this.comboT;
    h.kills = this.kills;
    h.demolished = this.city.demolished;
    h.alt = Math.max(0, this.pos.y);
    h.spd = this.vel.length() * 3.6;
    const boss = this.enemies.boss;
    h.bossOn = !!boss && !boss.dead;
    if (boss) { h.bossHp = Math.max(0, boss.hp); h.bossMax = boss.maxHp; }
    h.cds.strike = this.cd.strike;
    h.cds.blast = this.cd.blast;
    h.cds.dash = this.cd.dash;
    h.cds.slam = this.cd.slam;
    h.cds.cyclone = this.cd.cyclone;
    h.blocking = this.blockT > 0.55;
    h.flurry = this.flurryOn;
    h.time = this.runTime;
  }
}
