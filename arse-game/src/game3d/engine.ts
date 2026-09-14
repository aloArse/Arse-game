// ==================== INVINCIBLE — Sky Guardian · 3D engine ====================
import * as THREE from "three";
import { FX, Trail } from "./fx";
import { City, CITY_HALF, ZONE_R } from "./city";
import { POSES, skinById } from "./character";
import { GLTFHeroRig, type HeroVisual } from "./heroModel";
import { Enemies, BOSS_TYPES, type EKind, type Enemy } from "./enemies";
import { audio } from "../game/audio";
import { installKeyboard, moveAxis, vertAxis, strafeAxis, holdStrike, holdBlast, holdBlock, holdVision, take, clearAll } from "../game/input";
import { ABILITIES, abilityById } from "../game/abilities";
import { settings, qualityProfile } from "../game/settings";
import { makeHud, type HudState, type RunStats } from "../game/types";
import { Weather } from "./weather";
import { SpaceLayer } from "./space";
import { Traffic } from "./traffic";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const CD_STRIKE = 0.36, CD_BLAST = 0.16, CD_DASH = 2.2, CD_SLAM = 6.5, CD_CYCLONE = 5.5, CD_BOLT = 9;
const CD_METEOR = 14, CD_CHAIN = 11, CD_BUBBLE = 18, CD_MISSILE = 12;
const EN_BLAST = 4, EN_DASH = 12, EN_SLAM = 32, EN_CYCLONE = 18, EN_METEOR = 30, EN_CHAIN = 16, EN_BUBBLE = 26, EN_MISSILE = 22;
/** space begins fading in above this altitude */
const SPACE_ALT = 1250;
/** the battle zone: central plaza */
const ZONE = new THREE.Vector3(0, 0, 0);
const UP_AXIS = new THREE.Vector3(0, 1, 0);
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

/** scripted meteor strike */
interface Meteor {
  active: boolean;
  t: number;             // 0..1 descent progress
  from: THREE.Vector3;
  to: THREE.Vector3;
  mesh: THREE.Mesh;
}

/** homing missile */
interface Missile {
  active: boolean;
  mesh: THREE.Group;
  v: THREE.Vector3;
  target: Enemy | null;
  life: number;
}

export class Engine {
  // --- three ---
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private heroLight!: THREE.PointLight;
  private shield!: THREE.Mesh;
  weather!: Weather;
  space!: SpaceLayer;
  traffic!: Traffic;
  private meteors: Meteor[] = [];
  private missiles: Missile[] = [];
  private bubbleMesh!: THREE.Mesh;
  private bubbleT = 0;
  private spaceMode = false;
  private ageT = 0;                 // 30s → +1 year
  private activeSkin = "classic";
  loadout: string[] = [...settings.get().loadout];
  private shakeEnabled = true;
  private bubblePulse = 0;

  // --- systems ---
  fx: FX;
  city: City;
  enemies: Enemies;
  trail: Trail;
  private fistTrailL: Trail;
  private fistTrailR: Trail;
  rig: HeroVisual;

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
  private slamPhase: "none" | "rise" | "dive" | "pdRise" | "pdDive" | "stomp" = "none";
  private dashT = 0; private dashDir = new THREE.Vector3(0, 0, 1); private dashId = 0;
  private cycloneT = 0; private cycloneHitT = 0; private cycloneSpin = 0;
  private blockT = 0;
  private flurryOn = false;
  private cd: Record<string, number> = { strike: 0, blast: 0, dash: 0, slam: 0, cyclone: 0, bolt: 0, meteor: 0, chain: 0, bubble: 0, missile: 0 };
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
  /* postprocessing (adaptive bloom) */
  private composer: EffectComposer | null = null;
  private bloomOn = true;
  private fpsEma = 60;
  private lowFpsT = 0;
  /* viltrumite aging — power grows with age, persists across runs */
  private heroAge = 18;
  private ageFlashT = 0;
  private lastIntensity = -1;
  private judgementMarks: { x: number; z: number; t: number; dur: number; pulse: number }[] = [];
  private heartT = 0;
  /* ground locomotion */
  private grounded = false;
  private walkT = 0;
  /* atomic vision beam */
  private visionT = 0;
  private beam: THREE.Group | null = null;
  /* 4th-hit spin */
  private spinT = 0;
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
  private _in = new THREE.Vector3(); // movement input — NEVER used as scratch by abilities
  private _v2 = new THREE.Vector3();
  private _v3 = new THREE.Vector3();
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

    const qp = qualityProfile(settings.get().quality);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qp.pixelRatio));
    this.shakeEnabled = settings.get().shake;

    this.buildLights();
    this.weather = new Weather(this.scene, qp.clouds);
    this.space = new SpaceLayer(this.scene, qp.clouds);
    this.traffic = new Traffic(this.scene, CITY_HALF, 78, qp.traffic);

    this.fx = new FX(this.scene);
    this.city = new City(this.scene);
    this.city.onRebuild = (b) => this.onCityRebuild(b);
    this.enemies = new Enemies(this.scene);

    // cinematic bloom pipeline (auto-disables on weak GPUs)
    try {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.72, 0.55, 0.82,
      );
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      this.composer = composer;
    } catch { this.composer = null; }
    this.trail = new Trail(this.scene, 28, 0xaad6ff, 0.55);
    this.fistTrailL = new Trail(this.scene, 11, 0xffe9b0, 0.34);
    this.fistTrailR = new Trail(this.scene, 11, 0xffe9b0, 0.34);

    this.activeSkin = settings.get().skin;
    this.rig = new GLTFHeroRig(skinById(this.activeSkin).pal, 1);
    this.scene.add(this.rig.group);

    this.buildShield();
    this.buildPools();

    {
      const st = settings.get();
      audio.setVolumes({ master: st.master, sfx: st.sfx, music: st.music });
    }

    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
    window.addEventListener("resize", this.onResize);
    this.toMenu();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------------- setup ---------------- */

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xffd9b0, 0x2a2740, 1.15);
    this.hemiLight = hemi;
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
    this.composer?.setSize(window.innerWidth, window.innerHeight);
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
    this.loadAge();
    this.judgementMarks.length = 0;
    this.lastIntensity = -1;
    this.setMsg(`DEFEND THE CITY — AGE ${this.heroAge} · PWR ${Math.round(this.powerMult() * 100)}%`, 2.6, "info");
  }

  private resetHero(): void {
    this.pos.set(0, 110, 180);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI;
    this.roll = 0; this.flyK = 0; this.cruise = 0;
    this.hp = this.hpMax(); this.en = 100; this.od = 0; this.odT = 0;
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
    this.cd = { strike: 0, blast: 0, dash: 0, slam: 0, cyclone: 0, bolt: 0, meteor: 0, chain: 0, bubble: 0, missile: 0 };
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
        this.updateEnvironment(raw);
      }

      if (!this.contextLost) {
        // adaptive quality: drop bloom if the device can't hold ~30fps
        this.fpsEma = this.fpsEma * 0.95 + (1 / Math.max(0.001, raw)) * 0.05;
        if (this.bloomOn && this.composer) {
          if (this.fpsEma < 28) {
            this.lowFpsT += raw;
            if (this.lowFpsT > 2.5) { this.bloomOn = false; }
          } else this.lowFpsT = Math.max(0, this.lowFpsT - raw * 0.5);
        }
        if (this.bloomOn && this.composer) this.composer.render();
        else this.renderer.render(this.scene, this.camera);
      }
      this.raf = requestAnimationFrame(this.loop);
    } catch (error) {
      this.failed = true;
      const message = error instanceof Error ? error.message : "Unknown 3D engine error";
      console.error("3D engine stopped", error);
      this.hooks.onFatal?.(message);
    }
  };

  /** weather + space + traffic + fog/lights, driven every frame */
  private updateEnvironment(dt: number): void {
    const spaceFade = this.space.fadeAt(this.pos.y);
    const wasSpace = this.spaceMode;
    this.spaceMode = spaceFade > 0.55;
    if (this.spaceMode !== wasSpace) {
      audio.play("space", 0.9);
      if (this.mode === "playing") {
        this.setMsg(this.spaceMode ? "مدار فضایی — به سیاره‌ها پرواز کن" : "بازگشت به زمین", 2.6, "info");
      }
    }
    this.weather.update(dt, this.camera.position, {
      spaceFade,
      onLightning: (i) => {
        audio.play("boom", 0.35 + i * 0.3);
        this.shake = Math.max(this.shake, 3 + i * 4);
      },
    });
    this.space.update(dt, this.camera.position, this.pos.y);

    // sun & ambient follow the weather
    this.sunLight.position.copy(this.weather.sunDir).multiplyScalar(900).add(this.pos);
    this.sunLight.color.copy(this.weather.out.sunColor);
    this.sunLight.intensity = this.weather.out.sunI * 2.6;
    this.hemiLight.intensity = 0.5 + this.weather.out.ambI;
    this.hemiLight.color.copy(this.weather.out.horizon);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.weather.out.fogColor);
    fog.density = this.weather.out.fogD * (1 - spaceFade * 0.92);

    this.traffic.update(dt, this.pos);
  }

  private onCityRebuild(b: { x: number; z: number; h: number }): void {
    audio.play("rebuild", 0.8);
    this.fx.ring(b.x, 2, b.z, 0x59c8ff, b.h * 1.6, 0.8, true, 2.4);
    for (let i = 0; i < 10; i++) {
      this.fx.spark(b.x + (Math.random() - 0.5) * b.h * 0.7, Math.random() * b.h, b.z + (Math.random() - 0.5) * b.h * 0.7,
        0x8fd8ff, 10, 26, 0.5, 0.3, 20, 1);
    }
  }
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
    this.rig.body.rotation.x = lerp(this.rig.body.rotation.x, -0.2, 1 - Math.exp(-3 * dt)); // v6.4: level showcase pitch for flyM
    this.rig.body.rotation.z = Math.sin(this.t * 0.6) * 0.12;
    this.rig.blendPose(POSES.fly, Math.min(1, dt * 4)); // v6.4: menu showcases the user's Flying loop
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

      // ---- automatic aging: +1 year every 30 seconds ----
      this.ageT += raw;
      if (this.ageT >= 30) {
        this.ageT -= 30;
        this.growAge(1);
        this.hp = Math.min(this.hpMax(), this.hp + 8);
      }
    }

    // ---- battle zone leash: enemies never leave the plaza district ----
    this.updateZoneLeash(dt);

    this.updateShots(dt);
    this.updateBombs(dt);
    this.updateOrbs(dt);
    this.updateThrown(dt);
    this.updateMeteors(dt);
    this.updateMissiles(dt);
    this.updateBubble(dt);

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
      spawnMinion: (p) => { const m = this.enemies.spawn("drone", p, 1 + this.wave * 0.08); m.hp *= 0.6; m.maxHp = m.hp; },
      judgement: (x, z, delay) => this.addJudgement(x, z, delay),
      blastAt: (x, z, radius, dmg) => this.cityStrike(x, z, radius, dmg),
    });

    this.updateJudgements(dt);
    this.updateMusicIntensity();
    this.updateVitalFx(dt);
    this.updateCamera(raw, false);
    this.syncHud();
  }

  /** dynamic music: calm flight → combat drums → warlord theme */
  private updateMusicIntensity(): void {
    let want = 0;
    if (this.enemies.list.some((e) => !e.dead)) want = 1;
    if (this.enemies.boss && !this.enemies.boss.dead) want = 2;
    if (want !== this.lastIntensity) {
      this.lastIntensity = want;
      audio.setIntensity(want);
    }
  }

  /** low-hp heartbeat + hypersonic wind streaks */
  private updateVitalFx(dt: number): void {
    if (this.hp < this.hpMax() * 0.28 && !this.heroDead) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 1.05;
        audio.play("heartbeat", 1);
      }
    }
    const spd = this.vel.length();
    if (spd > 62 && !this.heroDead) {
      const k = Math.min(1, (spd - 62) / 90);
      if (Math.random() < 0.35 + k * 0.5) {
        // wind streaks rushing past the hero
        const s = this._v;
        s.copy(this.vel).normalize();
        const px = this.pos.x - s.x * 6 + (Math.random() - 0.5) * 14;
        const py = this.pos.y - s.y * 6 + (Math.random() - 0.5) * 10;
        const pz = this.pos.z - s.z * 6 + (Math.random() - 0.5) * 14;
        this.fx.jet(px, py, pz, -s.x, -s.y, -s.z, 0xbcd8ff, 1, spd * 1.35, 0.06, 0.55 + k * 0.5, 0.3 + k * 0.2);
      }
    }
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
    this.rig.addFlutter(this.t, 0.15);
    this.rig.updateClip(dt);
    this.fistTrailL.update(this.pos, this.camera, 0);
    this.fistTrailR.update(this.pos, this.camera, 0);
    this.updateCamera(raw, true);
    if (this.deadT <= 0 && this.mode === "playing") {
      this.mode = "over";
      this.saveAge();
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
      if (!this.clapFired && this.clapT <= 0.07) { this.clapFired = true; this.thunderClap(); }
      if (this.clapT <= 0) this.clapT = 0;
    }
    this.updateGrab(dt);
    this.cd.strike = Math.max(0, this.cd.strike - dt);
    this.cd.blast = Math.max(0, this.cd.blast - dt);
    this.cd.dash = Math.max(0, this.cd.dash - dt);
    this.cd.slam = Math.max(0, this.cd.slam - dt);
    this.cd.meteor = Math.max(0, this.cd.meteor - dt);
    this.cd.chain = Math.max(0, this.cd.chain - dt);
    this.cd.bubble = Math.max(0, this.cd.bubble - dt);
    this.cd.missile = Math.max(0, this.cd.missile - dt);
    this.cd.cyclone = Math.max(0, this.cd.cyclone - dt);
    this.cd.bolt = Math.max(0, this.cd.bolt - dt);

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

    this._in.set(0, 0, 0);
    this._in.addScaledVector(this._right, mv.x);
    this._in.addScaledVector(this._fwd, mv.y);
    // right flight stick also contributes lateral strafing
    const strafe = strafeAxis();
    if (strafe !== 0) this._in.addScaledVector(this._right, strafe * 0.85);
    const flatIn = this._in.length();
    if (flatIn > 1) this._in.divideScalar(flatIn);

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
    const ageS = this.speedMult();
    const maxSpd = (36 + this.cruise * 62) * (od ? 1.22 : 1) * (blocking ? 0.4 : 1) * ageS;
    const accel = (od ? 132 : 108) * (blocking ? 0.4 : 1) * ageS;

    // aim direction (facing, used by abilities)
    if (flatIn > 0.1 || Math.abs(vert) > 0.1) {
      this._aim.copy(this._in);
      this._aim.y += vert * 0.85;
      if (this._aim.lengthSq() > 1e-4) this._aim.normalize();
    } else {
      this._aim.set(Math.sin(this.yaw), this._aim.y * 0.9, Math.cos(this.yaw)).normalize();
    }

    // ---- abilities ----
    if (this.cd.strike <= 0 && this.slamPhase === "none" && this.cycloneT <= 0 && (holdStrike() || take("strike"))) {
      take("strike"); // consume any lingering tap so one press can never double-fire
      this.doStrike();
    }
    if (holdBlast() && this.cd.blast <= 0 && this.en >= EN_BLAST && this.slamPhase === "none" && this.dashT <= 0 && this.cycloneT <= 0) this.doBlast();
    if (this.cd.dash <= 0 && this.en >= EN_DASH && this.slamPhase === "none" && this.cycloneT <= 0 && take("dash")) this.doDash();
    if (this.slamPhase === "none" && this.cycloneT <= 0 && take("slam")) {
      if (this.grabbed) this.startPiledrive();
      else if (this.grounded && this.cd.slam <= 0 && this.en >= EN_SLAM * 0.6) this.startStomp();
      else if (this.cd.slam <= 0 && this.en >= EN_SLAM) this.startSlam();
    }
    if (this.cd.cyclone <= 0 && this.en >= EN_CYCLONE && this.slamPhase === "none" && this.cycloneT <= 0 && this.dashT <= 0 && !this.grabbed && take("cyclone")) this.doCyclone();
    if (this.cd.bolt <= 0 && this.slamPhase === "none" && this.cycloneT <= 0 && this.dashT <= 0 && take("bolt")) this.doBoltStrike();
    if (this.cd.meteor <= 0 && this.en >= EN_METEOR && this.slamPhase === "none" && this.cycloneT <= 0 && this.dashT <= 0 && take("meteor")) this.doMeteor();
    if (this.cd.chain <= 0 && this.en >= EN_CHAIN && this.slamPhase === "none" && this.cycloneT <= 0 && this.dashT <= 0 && take("chain")) this.doChainLightning();
    if (this.cd.bubble <= 0 && this.en >= EN_BUBBLE && this.slamPhase === "none" && this.cycloneT <= 0 && this.dashT <= 0 && take("bubble")) this.doBubble();
    if (this.cd.missile <= 0 && this.en >= EN_MISSILE && this.slamPhase === "none" && this.cycloneT <= 0 && this.dashT <= 0 && take("missile")) this.doMissiles();
    // ---- atomic vision: hold to fire a melting beam from the eyes ----
    if (holdVision() && this.en > 2 && this.slamPhase === "none" && this.cycloneT <= 0 && this.dashT <= 0) {
      this.en = Math.max(0, this.en - 23 * dt);
      this.updateVision(dt);
    } else if (this.beam) {
      this.beam.visible = false;
      this.visionT = 0;
    }
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
    } else if (this.grounded) {
      // ---- ground locomotion: walk / run ----
      const run = mv.mag > 0.82;
      const gSpd = (run ? 23 : 15) * this.speedMult();
      this._v2.copy(this._in).multiplyScalar(gSpd);
      this._v2.y = 0;
      const k = 1 - Math.exp(-7.5 * dt);
      this.vel.x = lerp(this.vel.x, this._v2.x, k);
      this.vel.z = lerp(this.vel.z, this._v2.z, k);
      this.vel.y = 0;
      // punch lunge (shorter on foot)
      if (this.punchT > 0) this.vel.addScaledVector(this._aim, 34 * dt * 10 * this.punchT);
    } else {
      // horizontal thrust
      this._v2.copy(this._in).multiplyScalar(maxSpd);
      // no vertical input → gentle auto-descend (superheroes don't freeze mid-air)
      this._v2.y = Math.abs(vert) > 0.15 ? vert * 46 : -14;
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
    if (this.pos.y > 3400) { this.pos.y = 3400; this.vel.y = Math.min(0, this.vel.y); }
    // thin air: thrust softens in space so the planets feel far away
    if (this.pos.y > SPACE_ALT) {
      const k = 1 - this.space.fadeAt(this.pos.y) * 0.45;
      this.vel.multiplyScalar(Math.pow(k, dt * 2));
    }

    // ---- city collision / smash-through ----
    this.resolveCityCollision(dt);

    // ---- ground / walking mode ----
    {
      let surf = this.city.surfaceY(this.pos.x, this.pos.z);
      if (this.pos.y > 900) {
        // standing on another planet?
        const ps = this.space.surfaceUnder(this.pos);
        if (ps) surf = Math.max(surf, ps.y);
      }
      const footY = surf + 1.15;
      if (this.pos.y <= footY + 0.25 && this.vel.y <= 10 && this.slamPhase === "none") {
        const fallSpd = this.vel.y;
        const wasAir = !this.grounded;
        if (this.pos.y < footY) this.pos.y = footY;
        this.vel.y = 0;
        this.grounded = true;
        if (wasAir && fallSpd < -34) this.groundImpact();
        // ground friction
        this.vel.x *= Math.exp(-3.2 * dt);
        this.vel.z *= Math.exp(-3.2 * dt);
      } else if (this.pos.y > footY + 0.5) {
        this.grounded = false;
      }
      if (this.grounded) {
        if (vert > 0.3 && this.slamPhase === "none") {
          // take off!
          this.grounded = false;
          this.vel.y = 36;
          audio.play("dash", 0.45);
          this.fx.ring(this.pos.x, this.pos.y - 1, this.pos.z, 0xbfe0ff, 9, 0.4, true, 1.4);
          this.fx.smoke(this.pos.x, this.pos.y - 1, this.pos.z, 6, 8, 2.4, 0xa89ca0, 1.4);
        } else {
          const spd = Math.hypot(this.vel.x, this.vel.z);
          const prevPhase = Math.sin(this.walkT);
          this.walkT += dt * this.rig.locoRate(spd);
          // a footfall every half cycle → dust puff + sparks when sprinting
          if (spd > 4 && Math.sin(this.walkT) < 0 && prevPhase >= 0) {
            this.fx.smoke(this.pos.x, this.pos.y - 1, this.pos.z, 1, 2.6, 1.2, 0x9a9098, 0.9);
            if (spd > 17) {
              this.fx.spark(this.pos.x, this.pos.y - 1, this.pos.z, 0xd8c8a8, 3, 7, 0.22, 0.5, 5, 0.6);
              audio.play("step", 0.25 + Math.min(0.5, spd / 60));
            }
          }
        }
      }
    }

    // ---- regen ----
    if (this.en < 100 && this.dashT <= 0) this.en = Math.min(100, this.en + 13 * dt);
    if (this.regenT <= 0 && this.hp < this.hpMax()) this.hp = Math.min(this.hpMax(), this.hp + 3.4 * dt);

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
    this.traffic.panicAt(p.x, p.z, 55);
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
    // spin backfist whirl
    if (this.spinT > 0) {
      this.spinT = Math.max(0, this.spinT - dt);
      this.yaw += dt * 24;
    }

    // flight blend + banking
    const targetFly = this.grounded ? 0 : this.dashT > 0 ? 1 : clamp((speed - 14) / 46, 0, 1);
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
    else if (this.flyK > 0.55) { pose = POSES.fly; blend = 7; } // v6.4: cruise always flies flyM (user's Flying) — diveM reserved for dash
    else if (this.flyK > 0.12) { pose = POSES.fly; blend = 6; }
    else if (this.grounded) {
      // on foot: procedural walk/run cycle or combat stance
      const gSpd = Math.hypot(this.vel.x, this.vel.z);
      pose = gSpd > 1.2 ? this.rig.walkPose(this.walkT, gSpd) : POSES.stand;
      blend = 11;
    }
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
    const climb = this.grounded ? 0 : clamp(this.vel.y / 55, -1, 1);
    const pitchTarget =
      this.slamPhase === "dive" || this.slamPhase === "pdDive" ? 0.75 :
        this.slamPhase === "rise" || this.slamPhase === "pdRise" ? -0.35 :
          this.cycloneT > 0 ? 0.1 :
            this.dashT > 0 ? -1.0 - climb * 0.5 : // v6.4: steep pitch only for diveM dash; cruise uses level-flight branch below
              this.flyK * (0 - climb * 0.55) + (1 - this.flyK) * (vert > 0 ? -0.12 : 0.06);
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
    this.rig.body.position.y = this.grounded ? 0 : Math.sin(this.t * 1.9) * 0.09 * (1 - this.flyK);

    this.rig.group.position.copy(this.pos);
    // cyclone adds a fast spin on top of the facing yaw
    if (this.cycloneT > 0) {
      // baked spinM owns the 360° whirl — no engine spin needed (mocap 2.2 rev/s)
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
        this.cd.strike = this.cdOf(CD_STRIKE * 0.38) * (od ? 0.72 : 1);
        this.punchT = 0.12;
        this.rig.playClip(this.punchSide === 0 ? "flurryR" : "flurryL", od ? 1.4 : 1.15);
        this.punchSide = 1 - this.punchSide;

        // magnetism: lunge toward the target so the barrage connects
        // (only when actually out of reach — never overshoot past the target)
        this._aim.subVectors(tgt.obj.position, this.pos).normalize();
        const d = tgt.obj.position.distanceTo(this.pos);
        if (d > 3.2) this.vel.addScaledVector(this._aim, Math.min(42, (d - 3.2) * 5));

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
          this.city.gouge(hitPos, 2.2, this.fx, 20, 2);
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

    // ---- regular chain (jab → cross → uppercut → SPIN BACKFIST) ----
    const step = this.comboStep;
    const finisher = step === 2;
    const spin = step === 3;
    this.comboStep = (step + 1) % 4;
    this.comboWindow = 0.85;
    if (spin) {
      // whirling backfist: 360° sweep that clears everything around you
      this.spinT = 0.3;
      this.punchT = 0.3;
      this.rig.playClip("cross", od ? 1.5 : 1.25);
      const dmg = (od ? 130 : 84);
      let hitAny = false;
      for (const e of this.enemies.list) {
        if (e.dead || e.grabbed) continue;
        const d = e.obj.position.distanceTo(this.pos);
        if (d < e.r + 7) {
          hitAny = true;
          this.damageEnemy(e, dmg, true);
          this._v2.subVectors(e.obj.position, this.pos).normalize();
          e.v.addScaledVector(this._v2, e.kind === "boss" ? 26 : 88);
          e.v.y += e.kind === "boss" ? 10 : 46;
        }
      }
      const b = this.city.collide(this._v.copy(this.pos).addScaledVector(this._aim, 2.6), 3.2, this._push);
      if (b) {
        hitAny = true;
        const before = this.city.demolished;
        this.city.gouge(this._v.clone(), 3.6, this.fx, 34, 5);
        if (this.city.demolished > before) this.onDemolish();
      }
      if (hitAny) {
        this.stopT = Math.max(this.stopT, 0.12);
        this.shake = Math.max(this.shake, 11);
        this.fx.flash(this.pos.x, this.pos.y, this.pos.z, 0xffe0a0, 6.5, 0.24);
        this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0xffd23f, 13, 0.4, false, 1.6);
        audio.play("punch", 1.4);
        navigator.vibrate?.(18);
      }
      this.cd.strike = this.cdOf(CD_STRIKE) * (od ? 0.72 : 1) * 2.2;
      return;
    }

    this.cd.strike = this.cdOf(finisher ? CD_STRIKE * 1.8 : CD_STRIKE) * (od ? 0.72 : 1);
    this.punchT = finisher ? 0.34 : 0.24;
    this.punchSide = step;
    this.rig.playClip(step === 0 ? "jabR" : step === 1 ? "crossL" : "uppercutR", od ? 1.25 : 1);

    // aim assist
    const tgt = this.nearestEnemy(finisher ? 26 : 22, 0.05);
    if (tgt) {
      this._aim.subVectors(tgt.obj.position, this.pos).normalize();
      // magnetism step toward distant targets (never overshoot past the target)
      const d = tgt.obj.position.distanceTo(this.pos);
      if (d > 3.5) this.vel.addScaledVector(this._aim, Math.min(40, (d - 3.5) * 5));
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

    // punch buildings — only the contact point shatters
    const b = this.city.collide(hitPos, finisher ? 3.4 : 2.6, this._push);
    if (b) {
      hitAny = true;
      const before = this.city.demolished;
      this.city.gouge(hitPos, finisher ? 3.6 : 2.6, this.fx, finisher ? 36 : 26, finisher ? 6 : 4);
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
    this.rig.playClip("kickHit", 1.7);

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

  /** ATOMIC VISION — sustained eye beam that melts whatever it touches */
  private updateVision(dt: number): void {
    if (!this.beam) {
      const g = new THREE.Group();
      const mkCyl = (r: number, col: number, op: number) =>
        new THREE.Mesh(
          new THREE.CylinderGeometry(r, r, 1, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        );
      g.add(mkCyl(0.14, 0xffffff, 0.95), mkCyl(0.5, 0xffb054, 0.42));
      g.visible = false;
      g.frustumCulled = false;
      this.scene.add(g);
      this.beam = g;
    }
    this.visionT -= dt;
    const origin = this._v3.copy(this.pos);
    origin.y += 0.62;
    origin.addScaledVector(this._aim, 0.6);
    const dir = this._aim;
    let len = 95;
    const hitP = this._v2;
    // march the ray
    for (let t = 2; t < 95; t += 2.0) {
      hitP.copy(origin).addScaledVector(dir, t);
      let stop = false;
      for (const e of this.enemies.list) {
        if (e.dead || e.grabbed) continue;
        if (e.obj.position.distanceTo(hitP) < e.r + 1.7) {
          len = t;
          this.damageEnemy(e, (this.odT > 0 ? 150 : 105) * dt, true);
          if (this.visionT <= 0) {
            this.visionT = 0.09;
            this.fx.spark(hitP.x, hitP.y, hitP.z, 0xffc890, 8, 14, 0.4, 0.3, -4, 1);
            this.fx.light(hitP.x, hitP.y, hitP.z, 0xffc060, 420, 0.14);
          }
          e.v.addScaledVector(dir, 260 * dt);
          stop = true;
          break;
        }
      }
      if (stop) break;
      const b = this.city.collide(hitP, 1.15, this._push);
      if (b) {
        len = t;
        // melt a localized crater — only where the beam touches
        if (this.visionT <= 0) {
          this.visionT = 0.09;
          this.city.gouge(hitP.clone(), 3.6, this.fx, 30, 3);
        }
        this.fx.jet(hitP.x, hitP.y, hitP.z, -dir.x, 0.6, -dir.z, 0xffd9a0, 3, 12, 0.9, 0.5, 0.4);
        this.fx.light(hitP.x, hitP.y, hitP.z, 0xffc060, 520, 0.12);
        break;
      }
    }
    // beam mesh stretches from the eyes to the hit point
    this.beam.visible = true;
    this.beam.position.copy(origin).addScaledVector(dir, len / 2);
    this.beam.quaternion.setFromUnitVectors(UP_AXIS, dir);
    const flick = 0.72 + Math.random() * 0.28;
    for (const c of this.beam.children) {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = (c === this.beam.children[0] ? 0.95 : 0.42) * flick;
    }
    this.beam.scale.set(1, len, 1);
    this.rig.setEyeGlow(0xffffff, 4.5);
    this.shake = Math.max(this.shake, 2.2);
    if (Math.random() < dt * 7) audio.play("beam", 0.55);
  }

  /** THUNDER STRIKE — call forked lightning down on the aimed target */
  private doBoltStrike(): void {
    this.cd.bolt = this.cdOf(CD_BOLT);
    const od = this.odT > 0;
    let best: Enemy | null = null;
    let bd = 85;
    for (const e of this.enemies.list) {
      if (e.dead || e.grabbed) continue;
      this._v2.subVectors(e.obj.position, this.pos);
      const d = this._v2.length();
      if (d > 85) continue;
      this._v2.normalize();
      if (this._v2.dot(this._aim) < 0.3) continue;
      if (d < bd) { bd = d; best = e; }
    }
    const target = new THREE.Vector3();
    if (best) target.copy(best.obj.position);
    else {
      target.copy(this.pos).addScaledVector(this._aim, 55);
      target.y = Math.max(1, this.city.surfaceY(target.x, target.z));
    }
    for (let i = 0; i < 3; i++) {
      const ox = (Math.random() - 0.5) * 7;
      const oz = (Math.random() - 0.5) * 7;
      this.fx.bolt(target.x + ox, target.y + 110 - i * 7, target.z + oz, target.x, target.y + 1.5, target.z, 0xbfe6ff, 0.22 + i * 0.07);
    }
    this.fx.flash(target.x, target.y + 2, target.z, 0xdff0ff, 11, 0.3);
    this.fx.light(target.x, target.y + 4, target.z, 0x9fd0ff, 1600, 0.4);
    this.fx.shock(target.x, target.y + 0.5, target.z, 0xbfe6ff, 26, 0.55);
    this.fx.spark(target.x, target.y + 1, target.z, 0xbfe6ff, 34, 28, 0.5, 0.55, -10, 1);
    audio.play("zap", 1.7);
    audio.play("boom", 0.6);
    this.shake = Math.max(this.shake, 8);
    for (const e of this.enemies.list) {
      if (e.dead || e.grabbed) continue;
      if (e.obj.position.distanceTo(target) < 7.5) {
        this.damageEnemy(e, (od ? 230 : 155), true);
        e.v.y += 34;
      }
    }
    if (!best) this.city.gouge(target, 5.5, this.fx, 36, 6);
  }

  /* ================= new v5 abilities ================= */

  /** METEOR CALL: a burning rock drops from orbit onto the aim point */
  private doMeteor(): void {
    this.en -= EN_METEOR;
    this.cd.meteor = this.cdOf(CD_METEOR);
    const target = this._v.copy(this.pos).addScaledVector(this._aim, 70);
    target.y = Math.max(0, this.city.surfaceY(target.x, target.z));
    if (this.en < 0) this.en = 0;
    const from = target.clone();
    from.y += 240; from.x += 34; from.z -= 28;

    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.4, 1),
      new THREE.MeshStandardMaterial({ color: 0xffa03c, emissive: 0xff5a1a, emissiveIntensity: 2.2, roughness: 0.6 }),
    );
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.meteors.push({ active: true, t: 0, from, to: target.clone(), mesh });
    this.rig.playClip("meteorCast", 1.0);
    audio.play("charge", 1);
    this.setMsg("شهاب‌سنگ در راه است!", 1.2, "warn");
  }

  private updateMeteors(dt: number): void {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (!m.active) continue;
      m.t += dt / 0.85;
      const k = Math.min(1, m.t);
      m.mesh.position.lerpVectors(m.from, m.to, k * k);
      m.mesh.rotation.x += dt * 7; m.mesh.rotation.y += dt * 5;
      // fire trail
      this.fx.jet(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z,
        (m.to.x - m.from.x) * 0.4, 0.6, (m.to.z - m.from.z) * 0.4, 0xffa03c, 5, 16, 0.4, 0.35, 0.25);
      this.fx.smoke(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, 2, 9, 2.2, 0x6a5a5a, 1.2);
      if (m.t >= 1) {
        // IMPACT
        m.active = false;
        this.scene.remove(m.mesh);
        (m.mesh.material as THREE.Material).dispose();
        m.mesh.geometry.dispose();
        this.meteors.splice(i, 1);
        const p = m.to;
        this.fx.explode(p.x, p.y + 2, p.z, 1.9, 0xff8a3c);
        this.city.blast(p, 24, 460, this.fx);
        for (const e of this.enemies.list) {
          if (e.dead || e.grabbed) continue;
          const d = e.obj.position.distanceTo(p);
          if (d < 22) { this.damageEnemy(e, (this.odT > 0 ? 320 : 210) * (1 - d / 26), true); e.v.y += 30; }
        }
        this.traffic.panicAt(p.x, p.z, 90);
        this.shake = Math.max(this.shake, 15);
        this.slowT = Math.max(this.slowT, 0.3);
        audio.play("meteor", 1);
        navigator.vibrate?.([60, 40, 120]);
      }
    }
  }

  /** CHAIN LIGHTNING: arcs between up to 5 enemies */
  private doChainLightning(): void {
    this.en -= EN_CHAIN;
    this.cd.chain = this.cdOf(CD_CHAIN);
    const od = this.odT > 0;

    let prev = this._v.copy(this.pos);
    let from = prev.clone();
    let hit: Enemy | null = null;
    let bd = 95;
    for (const e of this.enemies.list) {
      if (e.dead || e.grabbed) continue;
      const d = e.obj.position.distanceTo(this.pos);
      if (d < bd) { bd = d; hit = e; }
    }
    let hops = 0;
    const hitSet = new Set<Enemy>();
    while (hit && hops < 5) {
      hitSet.add(hit);
      const to = hit.obj.position.clone();
      this.fx.bolt(from.x, from.y, from.z, to.x, to.y + 1, to.z, 0x9fe8ff, 0.16 + hops * 0.04);
      this.fx.flash(to.x, to.y + 1, to.z, 0xbfefff, 6, 0.2);
      this.damageEnemy(hit, (od ? 130 : 88) * (1 - hops * 0.12), true);
      hit.v.y += 8;
      from = to.clone();
      hops++;
      // next hop: nearest unhit enemy within 44m
      let next: Enemy | null = null;
      let nd = 44;
      for (const e of this.enemies.list) {
        if (e.dead || e.grabbed || hitSet.has(e)) continue;
        const d = e.obj.position.distanceTo(from);
        if (d < nd) { nd = d; next = e; }
      }
      hit = next;
    }
    if (hops === 0) {
      // no target: bolt into the ground ahead
      const to = this._v2.copy(this.pos).addScaledVector(this._aim, 40);
      to.y = Math.max(0, this.city.surfaceY(to.x, to.z));
      this.fx.bolt(this.pos.x, this.pos.y, this.pos.z, to.x, to.y + 1, to.z, 0x9fe8ff, 0.22);
      this.city.gouge(to, 4, this.fx, 30, 4);
    }
    this.shake = Math.max(this.shake, 4 + hops);
    audio.play("chain", 1);
  }

  /** FORCE BUBBLE: 5s of soak + knockback */
  private doBubble(): void {
    this.en -= EN_BUBBLE;
    this.cd.bubble = this.cdOf(CD_BUBBLE);
    this.bubbleT = 5;
    if (!this.bubbleMesh) {
      this.bubbleMesh = new THREE.Mesh(
        new THREE.SphereGeometry(5.2, 26, 18),
        new THREE.MeshBasicMaterial({
          color: 0x7ae0ff, transparent: true, opacity: 0.22, fog: false,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      this.bubbleMesh.frustumCulled = false;
      this.scene.add(this.bubbleMesh);
    }
    this.bubbleMesh.visible = true;
    audio.play("bubble", 1);
  }

  private updateBubble(dt: number): void {
    if (this.bubbleT <= 0) {
      if (this.bubbleMesh) this.bubbleMesh.visible = false;
      return;
    }
    this.bubbleT -= dt;
    this.bubblePulse = Math.max(0, this.bubblePulse - dt * 3);
    const k = Math.min(1, this.bubbleT / 0.6);
    const s = 1 + this.bubblePulse * 0.18 + Math.sin(this.t * 6) * 0.03;
    this.bubbleMesh.scale.setScalar(s * k);
    this.bubbleMesh.position.copy(this.pos);
    (this.bubbleMesh.material as THREE.MeshBasicMaterial).opacity = (0.18 + this.bubblePulse * 0.3) * k;
    // push enemies away
    for (const e of this.enemies.list) {
      if (e.dead || e.grabbed) continue;
      const d = e.obj.position.distanceTo(this.pos);
      if (d < 9) {
        this._v2.subVectors(e.obj.position, this.pos).normalize();
        e.v.addScaledVector(this._v2, 120 * dt * (1 - d / 9));
      }
    }
    if (this.bubbleT <= 0) {
      this.bubbleMesh.visible = false;
      this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0x7ae0ff, 12, 0.4, false, 1.8);
    }
  }

  /** MISSILE BARRAGE: 6 homing rockets */
  private doMissiles(): void {
    this.en -= EN_MISSILE;
    this.cd.missile = this.cdOf(CD_MISSILE);
    const targets = this.enemies.list.filter((e) => !e.dead && !e.grabbed);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.22, 0.9, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8dbe4, metalness: 0.6, roughness: 0.3 }),
      );
      body.rotation.x = Math.PI / 2;
      g.add(body);
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0xd32436, emissive: 0xd32436, emissiveIntensity: 0.8 }),
      );
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.75;
      g.add(tip);
      const a = (i / 6) * Math.PI * 2;
      g.position.copy(this.pos).add(new THREE.Vector3(Math.cos(a) * 2.2, -0.4, Math.sin(a) * 2.2));
      this.scene.add(g);
      this.missiles.push({
        active: true, mesh: g,
        v: new THREE.Vector3(Math.cos(a) * 14, 9, Math.sin(a) * 14),
        target: targets.length ? targets[i % targets.length] : null,
        life: 5,
      });
    }
    audio.play("missile", 1);
    this.shake = Math.max(this.shake, 4);
  }

  private updateMissiles(dt: number): void {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      if (!m.active) continue;
      m.life -= dt;
      // retarget if the target died
      if (!m.target || m.target.dead) {
        m.target = this.enemies.list.find((e) => !e.dead && !e.grabbed) ?? null;
      }
      const speed = Math.min(85, 24 + (5 - m.life) * 46);
      if (m.target) {
        this._v2.subVectors(m.target.obj.position, m.mesh.position).normalize();
        m.v.lerp(this._v2.multiplyScalar(speed), Math.min(1, dt * 4.5));
      } else {
        m.v.multiplyScalar(1 - dt * 0.4);
        m.v.y += dt * 6;
      }
      m.mesh.position.addScaledVector(m.v, dt);
      m.mesh.lookAt(this._v.copy(m.mesh.position).add(m.v));
      // exhaust
      this.fx.jet(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z,
        -m.v.x * 0.06, -m.v.y * 0.06, -m.v.z * 0.06, 0xffb46a, 2, 7, 0.22, 0.2, 0.16);

      let boom = m.life <= 0;
      if (m.target && m.mesh.position.distanceTo(m.target.obj.position) < m.target.r + 2.4) {
        this.damageEnemy(m.target, this.odT > 0 ? 120 : 78, true);
        m.target.v.y += 10;
        boom = true;
      }
      const b = this.city.collide(m.mesh.position, 0.8, this._push);
      if (b) { this.city.damage(b, 60, m.mesh.position, this.fx, 18); boom = true; }
      if (m.mesh.position.y < 0.4) boom = true;

      if (boom) {
        const p = m.mesh.position;
        this.fx.explode(p.x, p.y, p.z, 0.45);
        audio.play("explode", 0.5);
        this.scene.remove(m.mesh);
        m.mesh.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) { (mesh.material as THREE.Material).dispose(); mesh.geometry.dispose(); }
        });
        this.missiles.splice(i, 1);
      }
    }
  }

  private doCyclone(): void {
    const od = this.odT > 0;
    this.en -= EN_CYCLONE;
    this.cd.cyclone = this.cdOf(CD_CYCLONE);
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
        .addScaledVector(this._aim, 0.55 + g.r * 0.85);
      this._v2.y += 1.5 + g.r * 0.25;
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
    // recoil: airborne only, and never enough to slingshot the hero backwards
    if (!this.grounded) {
      const back = this.vel.dot(this._v2);
      if (back > -13) this.vel.addScaledVector(this._v2, -2.2);
    }
    audio.play("zap");
  }

  private doDash(): void {
    this.en -= EN_DASH;
    this.cd.dash = this.cdOf(CD_DASH);
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

  /** ground stomp — a shockwave that radiates out from where you stand */
  private startStomp(): void {
    this.en -= EN_SLAM * 0.6;
    this.cd.slam = this.cdOf(CD_SLAM * 0.7);
    this.slamPhase = "stomp";
    this.slamT = 0.26;
    this.iT = Math.max(this.iT, 0.3);
    audio.play("warn", 0.5);
  }

  private startSlam(): void {
    this.en -= EN_SLAM;
    this.cd.slam = this.cdOf(CD_SLAM);
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
    this.cd.slam = this.cdOf(CD_SLAM);
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
    } else if (this.slamPhase === "stomp") {
      this.vel.y = 0;
      this.fx.jet(this.pos.x, this.pos.y - 1, this.pos.z, 0, 1, 0, 0xffd23f, 3, 10, 0.8, 0.4, 0.3);
      if (this.slamT <= 0) {
        this.slamPhase = "none";
        const p = this._v.copy(this.pos);
        p.y = this.city.surfaceY(p.x, p.z) + 0.5;
        const R = 30;
        this.city.blast(p, R, (this.odT > 0 ? 260 : 170) * this.powerMult(), this.fx);
        this.fx.shock(p.x, p.y, p.z, 0xffd23f, R * 1.5, 0.8);
        this.fx.flash(p.x, p.y + 1, p.z, 0xffe0a0, 12, 0.4);
        this.fx.chunk(p.x, p.y, p.z, 0xb9b2a6, 14, 20, 1.2, 1.5);
        this.fx.light(p.x, p.y + 6, p.z, 0xffb054, 1300, 0.5);
        for (const e of this.enemies.list) {
          if (e.dead || e.grabbed) continue;
          const d = e.obj.position.distanceTo(p);
          if (d < R + 6) {
            this.damageEnemy(e, (this.odT > 0 ? 120 : 80) * (1 - d / (R + 6)) + 20, true);
            e.v.y += 56;
          }
        }
        audio.play("slam", 1);
        this.shake = Math.max(this.shake, 14);
        navigator.vibrate?.(60);
        this.groundImpact();
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
        this.city.blast(p, R, 300, this.fx);
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
        if (o.kind === "hp") this.hp = Math.min(this.hpMax(), this.hp + 16);
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

  /* ---------------- viltrumite growth ---------------- */

  /** power multiplier from age — every year past 18: +3% damage (cap +150%) */
  private powerMult(): number { return Math.min(2.5, 1 + (this.heroAge - 18) * 0.03); }
  /** speed multiplier from age (cap +45%) */
  private speedMult(): number { return Math.min(1.45, 1 + (this.heroAge - 18) * 0.012); }
  /** max hp from age (+2.5/yr, cap 250) */
  private hpMax(): number { return Math.min(250, Math.round(100 + (this.heroAge - 18) * 2.5)); }
  /** cooldown multiplier from age (floor 70%) */
  private cdOf(base: number): number { return base * Math.max(0.7, 1 - (this.heroAge - 18) * 0.008); }

  private loadAge(): void {
    try {
      const v = window.localStorage.getItem("sg_age_v1");
      if (v) this.heroAge = Math.max(18, Math.min(200, parseInt(v, 10) || 18));
    } catch { /* private mode */ }
  }

  private saveAge(): void {
    try { window.localStorage.setItem("sg_age_v1", String(this.heroAge)); } catch { /* noop */ }
  }

  private growAge(years: number): void {
    this.heroAge += years;
    this.ageFlashT = 3.2;
    this.saveAge();
    audio.play("levelup", 1);
    navigator.vibrate?.([30, 40, 30]);
    this.setMsg(
      `VILTRUMITE GROWTH — AGE ${this.heroAge} · PWR ${Math.round(this.powerMult() * 100)}%`,
      3, "info",
    );
  }

  /** warlord judgement: pulsing ground telegraph before the strike lands */
  private addJudgement(x: number, z: number, delay: number): void {
    this.judgementMarks.push({ x, z, t: 0, dur: delay, pulse: 0 });
  }

  private updateJudgements(dt: number): void {
    for (let i = this.judgementMarks.length - 1; i >= 0; i--) {
      const j = this.judgementMarks[i];
      j.t += dt;
      j.pulse -= dt;
      if (j.pulse <= 0) {
        j.pulse = 0.14;
        const surf = this.city.surfaceY(j.x, j.z);
        const k = 1 - Math.max(0, Math.min(1, j.t / j.dur));
        this.fx.ring(j.x, surf + 0.6, j.z, 0xffb054, 3 + 26 * k, 0.3, true, 2.2);
      }
      if (j.t >= j.dur) this.judgementMarks.splice(i, 1);
    }
  }

  /** ground detonation used by warlord judgement strikes */
  private cityStrike(x: number, z: number, radius: number, dmg: number): void {
    const surf = this.city.surfaceY(x, z);
    this._v2.set(x, surf + 2, z);
    this.city.blast(this._v2, radius, 400 + dmg * 12, this.fx);
    this.fx.shock(x, surf + 1, z, 0xffb054, radius * 1.5, 0.7);
    this.fx.flash(x, surf + 4, z, 0xffd9a0, radius * 0.8, 0.4);
    this.fx.smoke(x, surf + 3, z, 24, 16, 7, 0x6d6470, 4);
    this.fx.chunk(x, surf + 2, z, 0xb9b2a6, 18, 24, 1.4, 1.8);
    this.fx.light(x, surf + 10, z, 0xffb054, 1200, 0.6);
    this.city.addFire(x + (Math.random() - 0.5) * 8, 1.6, z + (Math.random() - 0.5) * 8, 12, 1);
    const d = Math.hypot(this.pos.x - x, this.pos.z - z);
    if (d < radius && Math.abs(this.pos.y - surf) < 30) {
      this.damagePlayer(dmg * (1 - d / radius), this._v2);
    }
  }

  private damageEnemy(e: Enemy, dmg: number, combo: boolean): void {
    if (e.dead) return;
    e.hp -= dmg * this.powerMult();
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
    if (big) {
      this.fx.shock(p.x, p.y, p.z, col, 78, 0.9);
      this.fx.light(p.x, p.y, p.z, col, 1400, 0.55);
      this.fx.chunk(p.x, p.y, p.z, 0xb9b2a6, 16, 22, 1.2, 1.6);
    } else {
      this.fx.ring(p.x, p.y, p.z, col, 18, 0.45, false, 1.2);
    }
    this.fx.smoke(p.x, p.y, p.z, big ? 30 : 10, big ? 16 : 9, big ? 6 : 2.6, 0x8f8490, big ? 4 : 2.2);
    this.city.spawnDebris(p.x, p.y, p.z, big ? 22 : 6, big ? 26 : 14, big ? 5 : 2.4);
    this.shake = Math.max(this.shake, big ? 20 : 4.5);
    audio.play("explode", big ? 1.4 : 0.8);
    // hit-stop: micro freeze that sells the impact
    this.stopT = Math.max(this.stopT, big ? 0.1 : 0.045);

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
    if (this.bubbleT > 0) {
      // force bubble soaks the hit
      this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0x7ae0ff, 9, 0.3, false, 1.6);
      audio.play("deflect", 0.5);
      this.bubblePulse = 1;
      return;
    }
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
    this.traffic.panicAt(this.pos.x, this.pos.z, 120);
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

  /* ---------------- live settings & customisation ---------------- */

  /** swap the hero skin at runtime — the real model has fixed textures, so this
   *  only updates the stored preference/HUD now (no rig rebuild needed). */
  setSkin(id: string): void {
    const skin = skinById(id);
    if (skin.id === this.activeSkin) return;
    this.activeSkin = skin.id;
    this.hud.skin = skin.id;
    // transformation shimmer
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.spark(
        this.pos.x + Math.cos(a) * 1.4, this.pos.y + Math.random() * 2.2, this.pos.z + Math.sin(a) * 1.4,
        0x9fe8ff, 8, 16, 0.5, 0.5, 7, 1);
    }
    this.fx.ring(this.pos.x, this.pos.y, this.pos.z, 0x9fe8ff, 8, 0.5, false, 2);
    audio.play("skin", 1);
  }

  /** swap which abilities sit on the on-screen cluster */
  setLoadout(ids: string[]): void {
    const valid = ids.filter((id) => abilityById(id)).slice(0, 6);
    this.loadout = valid.length ? valid : [...settings.get().loadout];
    this.hud.loadout = this.loadout;
    audio.play("swap", 1);
  }

  /** apply quality/audio settings live */
  applySettings(): void {
    const st = settings.get();
    const qp = qualityProfile(st.quality);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qp.pixelRatio));
    this.onResize();
    this.bloomOn = qp.bloom && this.fpsEma > 28;
    this.shakeEnabled = st.shake;
    audio.setVolumes({ master: st.master, sfx: st.sfx, music: st.music });
  }

  /** QA helper: advance the simulation without rendering (slow headless GPUs
   *  run the raf loop at a few fps, so real-time waits are unreliable in tests). */
  fastForward(seconds: number): void {
    let t = Math.min(30, Math.max(0, seconds));
    while (t > 1e-4) {
      const dt = Math.min(1 / 30, t);
      t -= dt;
      if (this.mode === "playing" && !this.paused) {
        if (this.heroDead) this.updateDeath(dt, dt);
        else this.updatePlaying(dt, dt);
      }
      this.city.update(dt, this.fx);
      this.fx.update(dt, this.camera);
      this.updateEnvironment(dt);
    }
  }

  private setMsg(msg: string, dur: number, kind: "info" | "warn"): void {
    this.hud.msg = msg;
    this.hud.msgT = dur;
    this.hud.msgKind = kind;
  }

  /* ---------------- waves ---------------- */

  /** enemies are arena-bound: outside the plaza they turn back */
  private updateZoneLeash(dt: number): void {
    const limit = ZONE_R + 55;
    for (const e of this.enemies.list) {
      if (e.dead || e.grabbed) continue;
      const dx = e.obj.position.x - ZONE.x;
      const dz = e.obj.position.z - ZONE.z;
      const d = Math.hypot(dx, dz);
      if (d > limit) {
        // flung way outside → snap back to the leash ring
        if (d > limit + 260) {
          e.obj.position.x = ZONE.x + (dx / d) * limit;
          e.obj.position.z = ZONE.z + (dz / d) * limit;
        }
        const k = Math.min(1, dt * 3);
        e.obj.position.x -= (dx / d) * (d - limit) * k * 3.2;
        e.obj.position.z -= (dz / d) * (d - limit) * k * 3.2;
        e.v.x -= (dx / d) * 90 * k;
        e.v.z -= (dz / d) * 90 * k;
        if (Math.random() < dt * 2) {
          this.fx.spark(e.obj.position.x, e.obj.position.y, e.obj.position.z, 0xff5a5a, 4, 10, 0.3, 0.4, 6, 1);
        }
      }
    }
    // hud flag for the zone indicator
    this.hud.zoneOut = Math.hypot(this.pos.x - ZONE.x, this.pos.z - ZONE.z) > ZONE_R + 90;
  }

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
    // wave clears still pay score + a heal (aging itself is timer-driven)
    if (n > 1) {
      this.hp = Math.min(this.hpMax(), this.hp + 16);
      this.score += 180 * (n - 1);
    }
    if (boss) {
      const bt = BOSS_TYPES[Math.floor(n / 5) - 1];
      this.setMsg(`⚠ ${bt.name} ${bt.title} INBOUND ⚠`, 3.2, "warn");
      audio.play("warn");
      this.slowT = Math.max(this.slowT, 0.6);
    } else {
      this.setMsg(`موج ${n} — در میدان نبرد`, 2, "info");
      audio.play("wave", 0.8);
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
    // enemies only materialise inside the arena plaza
    const a = Math.random() * Math.PI * 2;
    const dist = kind === "boss" ? 36 : kind === "mech" ? 80 : Math.min(ZONE_R - 12, 45 + Math.random() * 55);
    const p = new THREE.Vector3(
      ZONE.x + Math.cos(a) * dist,
      0,
      ZONE.z + Math.sin(a) * dist,
    );
    const surf = this.city.surfaceY(p.x, p.z);
    p.y = Math.max(surf + 14, this.pos.y + (Math.random() - 0.3) * 30);
    if (kind === "bomber") p.y = Math.max(p.y, surf + 60);
    p.y = clamp(p.y, 16, 460);

    const hpMult = 1 + this.wave * 0.1;
    const bossIdx = Math.floor(this.wave / 5) - 1;
    const e = this.enemies.spawn(kind, p, hpMult, bossIdx);

    const col =
      kind === "boss" ? 0xff4757 :
        kind === "mech" ? 0xff8a3c :
          kind === "bomber" ? 0xffb054 :
            kind === "raptor" ? 0xff6b7a : 0x7ae0ff;
    this.fx.ring(p.x, p.y, p.z, col, kind === "boss" ? 30 : 12, 0.6, false, 1.4);
    if (kind === "boss") {
      // warlord entrance: sky pillar + double shock + light + roar
      const bt = BOSS_TYPES[Math.abs(bossIdx) % BOSS_TYPES.length];
      const surf = this.city.surfaceY(p.x, p.z);
      this.fx.flash(p.x, p.y, p.z, bt.color, 16, 0.6);
      this.fx.pillar(p.x, p.z, surf, p.y + 40, bt.color, 6, 1.2);
      this.fx.shock(p.x, p.y, p.z, bt.color, 46, 0.9);
      this.fx.light(p.x, p.y, p.z, bt.color, 1600, 1.1);
      audio.play("bossroar");
      this.shake = Math.max(this.shake, 12);
      this.slowT = Math.max(this.slowT, 0.45);
      navigator.vibrate?.([80, 60, 160]);
      this.setMsg(`${bt.name} ${bt.title} — ENGAGE`, 2.4, "warn");
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

    const portrait = this.camera.aspect < 1;
    const back = 11 + clamp(speed * 0.075, 0, 8) + (this.dashT > 0 ? 3.5 : 0) + (portrait ? 5 : 0);
    const up = 3.6 + clamp(speed * 0.012, 0, 2.4) + (portrait ? 1.8 : 0) + (this.grounded ? -1.2 : 0);
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
    if (this.shake > 0.05 && this.shakeEnabled) {
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
    const fovT = (portrait ? 76 : 62) + clamp((speed - 30) / 140, 0, 1) * 26 + (this.dashT > 0 ? 8 : 0) + this.fovKick;
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
    if (boss) {
      h.bossHp = Math.max(0, boss.hp);
      h.bossMax = boss.maxHp;
      h.bossName = boss.bossName ? `${boss.bossName} · ${BOSS_TYPES.find((b) => b.name === boss.bossName)?.title ?? ""}` : "WARLORD";
    }
    h.age = this.heroAge;
    h.power = Math.round(this.powerMult() * 100);
    h.maxHp = this.hpMax();
    this.ageFlashT = Math.max(0, this.ageFlashT - 0.016);
    h.ageFlash = this.ageFlashT;
    for (const a of ABILITIES) {
      h.cds[a.id] = this.cd[a.id] ?? 0;
      h.cdMax[a.id] = this.cdOf(a.cd);
    }
    h.blocking = this.blockT > 0.55;
    h.flurry = this.flurryOn;
    h.time = this.runTime;
    h.loadout = this.loadout;
    h.skin = this.activeSkin;
    h.inSpace = this.spaceMode;
    h.weatherLabel = this.weather.out.label;
    h.ageNext = this.ageT / 30;
    h.fps = Math.round(this.fpsEma);
    const np = this.space.nearestPlanet(this.pos);
    h.planet = this.pos.y > 900 && np && np.dist < np.planet.r * 4.5 ? np.planet.name : "";
  }
}
