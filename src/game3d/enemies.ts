// ---------- 3D enemies: Flaxan drones, seekers, raptors, gunships, bombers,
// siege mechs + Viltrumite warlord. Wreck physics on death.
import * as THREE from "three";
import { Rig, POSES, BOSS_PAL } from "./character";
import type { FX } from "./fx";
import type { City } from "./city";

export type EKind = "drone" | "seeker" | "raptor" | "gunship" | "bomber" | "mech" | "boss";

export interface Enemy {
  kind: EKind;
  obj: THREE.Group;
  rig: Rig | null;
  v: THREE.Vector3;
  hp: number; maxHp: number;
  r: number;
  t: number;
  fireT: number;
  state: string;
  stateT: number;
  seed: number;
  strafe: number;
  flash: number;
  dashMark: number;
  dead: boolean;
  core: THREE.Mesh | null;
  rotors: THREE.Mesh[];
  grabbed: boolean;      // held by the hero — engine drives the transform
  thrown: number;        // >0 while flying as a hero-thrown projectile
  tumble: THREE.Vector3;
  // wreck phase
  dieT: number;
  wreckSpin: THREE.Vector3;
  wreckPop: number;
  // animated glow materials (nav lights, cores)
  glowMats: THREE.MeshStandardMaterial[];
  // bomber target
  targetBuilding: { x: number; z: number; top: number } | null;
  doors: THREE.Object3D[];
}

export interface EnemyCtx {
  dt: number;
  hero: THREE.Vector3;
  heroVel: THREE.Vector3;
  heroDead: boolean;
  fx: FX;
  city: City;
  time: number;
  shoot: (from: THREE.Vector3, dir: THREE.Vector3, speed: number, dmg: number, color: number, radius: number) => void;
  hitPlayer: (dmg: number, from: THREE.Vector3) => void;
  shake: (amount: number) => void;
  slamBlast: (at: THREE.Vector3, radius: number, dmg: number) => void;
  dropBomb: (from: THREE.Vector3, vel: THREE.Vector3) => void;
  sfx: (name: string, power?: number) => void;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

/* ---------------- materials ---------------- */

const MAT = {
  droneHull: new THREE.MeshStandardMaterial({ color: 0x47507c, roughness: 0.38, metalness: 0.82 }),
  dronePlate: new THREE.MeshStandardMaterial({ color: 0x2a3055, roughness: 0.5, metalness: 0.7 }),
  droneTrim: new THREE.MeshStandardMaterial({ color: 0x151a33, roughness: 0.62, metalness: 0.55 }),
  droneRing: new THREE.MeshStandardMaterial({
    color: 0x8a93c4, roughness: 0.28, metalness: 0.95,
    emissive: new THREE.Color(0x3a2050), emissiveIntensity: 0.6,
  }),
  droneGlow: new THREE.MeshStandardMaterial({
    color: 0xff5a6e, emissive: new THREE.Color(0xff2f45), emissiveIntensity: 3.2, roughness: 0.25,
  }),
  seekBody: new THREE.MeshStandardMaterial({ color: 0x7a3040, roughness: 0.45, metalness: 0.7 }),
  seekDark: new THREE.MeshStandardMaterial({ color: 0x321a24, roughness: 0.75, metalness: 0.4 }),
  seekWarn: new THREE.MeshStandardMaterial({
    color: 0xffc14a, emissive: new THREE.Color(0xff8a1e), emissiveIntensity: 2.4, roughness: 0.4,
  }),
  seekGlow: new THREE.MeshStandardMaterial({
    color: 0xffb054, emissive: new THREE.Color(0xff7a2a), emissiveIntensity: 3.4, roughness: 0.3,
  }),
  gunHull: new THREE.MeshStandardMaterial({ color: 0x555f88, roughness: 0.4, metalness: 0.85 }),
  gunPlate: new THREE.MeshStandardMaterial({ color: 0x39416a, roughness: 0.5, metalness: 0.75 }),
  gunDark: new THREE.MeshStandardMaterial({ color: 0x1d2340, roughness: 0.62, metalness: 0.6 }),
  gunGlass: new THREE.MeshStandardMaterial({
    color: 0x9fe0ff, emissive: new THREE.Color(0x2d74ad), emissiveIntensity: 1.1,
    roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.82,
  }),
  gunGlow: new THREE.MeshStandardMaterial({
    color: 0xc66bff, emissive: new THREE.Color(0xa23dff), emissiveIntensity: 3, roughness: 0.3,
  }),
  engine: new THREE.MeshStandardMaterial({
    color: 0x7fd4ff, emissive: new THREE.Color(0x3aa8ff), emissiveIntensity: 3.2, roughness: 0.3,
  }),
  navRed: new THREE.MeshStandardMaterial({
    color: 0xff4757, emissive: new THREE.Color(0xff2233), emissiveIntensity: 2.6, roughness: 0.4,
  }),
  blade: new THREE.MeshStandardMaterial({
    color: 0xc3cbe6, roughness: 0.3, metalness: 0.9, transparent: true, opacity: 0.42,
  }),
  // raptor
  rapHull: new THREE.MeshStandardMaterial({ color: 0x3d466f, roughness: 0.34, metalness: 0.88 }),
  rapDark: new THREE.MeshStandardMaterial({ color: 0x1c2138, roughness: 0.55, metalness: 0.7 }),
  rapEdge: new THREE.MeshStandardMaterial({
    color: 0xff6b7a, emissive: new THREE.Color(0xff2f45), emissiveIntensity: 2.6, roughness: 0.3, metalness: 0.4,
  }),
  // bomber
  bombHull: new THREE.MeshStandardMaterial({ color: 0x4a4358, roughness: 0.5, metalness: 0.72 }),
  bombPlate: new THREE.MeshStandardMaterial({ color: 0x322c42, roughness: 0.6, metalness: 0.6 }),
  bombBay: new THREE.MeshStandardMaterial({ color: 0x211c30, roughness: 0.7, metalness: 0.5 }),
  // mech
  mechHull: new THREE.MeshStandardMaterial({ color: 0x5c5244, roughness: 0.46, metalness: 0.78 }),
  mechPlate: new THREE.MeshStandardMaterial({ color: 0x3a332a, roughness: 0.58, metalness: 0.66 }),
  mechDark: new THREE.MeshStandardMaterial({ color: 0x241f1a, roughness: 0.65, metalness: 0.55 }),
  mechGlow: new THREE.MeshStandardMaterial({
    color: 0xff8a3c, emissive: new THREE.Color(0xff5a1e), emissiveIntensity: 3, roughness: 0.3,
  }),
  mechHot: new THREE.MeshStandardMaterial({
    color: 0xffd23f, emissive: new THREE.Color(0xffa01e), emissiveIntensity: 3.6, roughness: 0.25,
  }),
};

/* ---------------- models ---------------- */

/** Flaxan interceptor — layered armour saucer with a counter-rotating ring */
function buildDrone(): { obj: THREE.Group; core: THREE.Mesh; spin: THREE.Mesh[] } {
  const g = new THREE.Group();
  const spin: THREE.Mesh[] = [];

  const top = new THREE.Mesh(new THREE.ConeGeometry(1.36, 0.82, 14), MAT.droneHull);
  top.position.y = 0.44;
  g.add(top);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), MAT.droneRing);
  crown.position.y = 0.92;
  g.add(crown);
  const step = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.5, 0.3, 14), MAT.dronePlate);
  step.position.y = 0.1;
  g.add(step);
  const under = new THREE.Mesh(new THREE.ConeGeometry(1.46, 0.78, 14), MAT.droneTrim);
  under.position.y = -0.33;
  under.rotation.x = Math.PI;
  g.add(under);
  const keel = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), MAT.droneGlow);
  keel.position.y = -0.74;
  keel.scale.set(1, 0.6, 1);
  g.add(keel);

  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.62), MAT.dronePlate);
    petal.position.set(Math.sin(a) * 1.24, 0.24, Math.cos(a) * 1.24);
    petal.rotation.y = a;
    petal.rotation.x = -0.32;
    g.add(petal);
  }

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.11, 8, 30), MAT.droneRing);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.04;
  g.add(ring);
  spin.push(ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), MAT.droneGlow);
    node.position.set(Math.sin(a) * 1.62, Math.cos(a) * 1.62, 0);
    ring.add(node);
  }

  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.24, 14), MAT.droneTrim);
  socket.rotation.x = Math.PI / 2;
  socket.position.set(0, -0.1, 0.92);
  g.add(socket);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), MAT.droneGlow);
  core.position.set(0, -0.1, 1.04);
  g.add(core);

  for (const sx of [-1, 1]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.15, 8), MAT.droneTrim);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(sx * 0.42, -0.28, 1.2);
    g.add(barrel);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), MAT.droneGlow);
    tip.position.set(sx * 0.42, -0.28, 1.78);
    g.add(tip);
  }

  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.78), MAT.dronePlate);
    fin.position.set(sx * 0.82, 0.34, -0.78);
    fin.rotation.z = sx * 0.42;
    g.add(fin);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.4), MAT.droneGlow);
    vent.position.set(sx * 0.6, 0.04, -1.16);
    g.add(vent);
  }

  return { obj: g, core, spin };
}

/** Flaxan seeker torpedo — warhead, fins, thruster bell */
function buildSeeker(): { obj: THREE.Group; core: THREE.Mesh; spin: THREE.Mesh[] } {
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.86, 5, 12), MAT.seekBody);
  body.rotation.x = Math.PI / 2;
  g.add(body);

  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.272, 0.036, 7, 16), MAT.seekDark);
    band.position.z = -0.26 + i * 0.3;
    g.add(band);
  }

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.56, 12), MAT.seekBody);
  nose.position.z = 0.9;
  nose.rotation.x = Math.PI / 2;
  g.add(nose);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), MAT.seekWarn);
  tip.position.z = 1.16;
  g.add(tip);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.14, 12), MAT.seekDark);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 0.62;
  g.add(collar);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.4, 0.42), MAT.seekDark);
    fin.position.set(Math.sin(a) * 0.3, Math.cos(a) * 0.3, -0.5);
    fin.rotation.z = -a;
    fin.rotation.x = 0.22;
    g.add(fin);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), MAT.seekWarn);
    led.position.set(Math.sin(a) * 0.42, Math.cos(a) * 0.42, -0.42);
    g.add(led);
  }

  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.26, 12, 1, true), MAT.seekDark);
  bell.rotation.x = Math.PI / 2;
  bell.position.z = -0.78;
  g.add(bell);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), MAT.seekGlow);
  core.position.z = -0.84;
  g.add(core);

  return { obj: g, core, spin: [] };
}

/** Flaxan raptor — blade-wing attack craft built for slashing strafing runs */
function buildRaptor(): { obj: THREE.Group; core: THREE.Mesh; spin: THREE.Mesh[] } {
  const g = new THREE.Group();

  // arrow fuselage
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.5, 5, 12), MAT.rapHull);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.66);
  g.add(body);

  // splitter nose blade
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 8), MAT.rapDark);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 1.5;
  nose.scale.set(0.5, 1, 1);
  g.add(nose);

  // cockpit slit
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.5), MAT.rapEdge);
  visor.position.set(0, 0.14, 0.72);
  g.add(visor);

  // swept blade wings with glowing edges
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.56), MAT.rapHull);
    wing.position.set(sx * 1.1, 0, -0.28);
    wing.rotation.y = sx * 0.62;
    wing.rotation.z = sx * 0.16;
    g.add(wing);
    // glowing leading edge
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 0.07), MAT.rapEdge);
    edge.position.set(sx * 1.05, 0.01, -0.02);
    edge.rotation.y = sx * 0.62;
    edge.rotation.z = sx * 0.16;
    g.add(edge);
    // wingtip blade
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.8, 6), MAT.rapDark);
    tip.position.set(sx * 2.0, 0.02, -0.8);
    tip.rotation.x = Math.PI / 2;
    tip.rotation.z = sx * 0.3;
    g.add(tip);
    const tipGlow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), MAT.rapEdge);
    tipGlow.position.set(sx * 2.0, 0.02, -0.36);
    g.add(tipGlow);
    // canard fin
    const canard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.2), MAT.rapHull);
    canard.position.set(sx * 0.5, 0.02, 0.72);
    canard.rotation.y = sx * 0.4;
    g.add(canard);
  }

  // twin tail fins
  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.5), MAT.rapHull);
    fin.position.set(sx * 0.3, 0.24, -1.1);
    fin.rotation.z = sx * 0.32;
    g.add(fin);
  }

  // engine
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.18, 0.3, 10, 1, true), MAT.rapDark);
  bell.rotation.x = Math.PI / 2;
  bell.position.z = -1.0;
  g.add(bell);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), MAT.droneGlow);
  core.position.z = -1.1;
  g.add(core);

  return { obj: g, core, spin: [] };
}

/** Flaxan gunship — armoured troop carrier with turret, engines and rotors */
function buildGunship(): { obj: THREE.Group; core: THREE.Mesh; spin: THREE.Mesh[] } {
  const g = new THREE.Group();
  const spin: THREE.Mesh[] = [];

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 3.1, 6, 14), MAT.gunHull);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.08, 1, 0.74);
  g.add(body);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.4, 3.4), MAT.gunPlate);
  spine.position.set(0, 0.82, -0.2);
  g.add(spine);
  for (let i = 0; i < 3; i++) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 0.7), MAT.gunPlate);
    plate.position.set(0, 0.42, 0.9 - i * 1.1);
    plate.rotation.x = 0.06;
    g.add(plate);
  }
  const chin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 1.5), MAT.gunPlate);
  chin.position.set(0, -0.68, 1.1);
  g.add(chin);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.78, 14, 12), MAT.gunGlass);
  cockpit.position.set(0, 0.28, 1.82);
  cockpit.scale.set(0.92, 0.72, 1.16);
  g.add(cockpit);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.055, 8, 18), MAT.gunDark);
  frame.position.set(0, 0.26, 1.78);
  frame.rotation.y = Math.PI / 2;
  frame.scale.set(0.8, 1, 1);
  g.add(frame);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.1, 12), MAT.gunHull);
  nose.position.set(0, -0.12, 2.5);
  nose.rotation.x = Math.PI / 2;
  g.add(nose);

  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.24, 1.25), MAT.gunPlate);
    wing.position.set(sx * 1.95, 0.08, -0.25);
    wing.rotation.z = sx * -0.09;
    g.add(wing);

    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 1.5, 12), MAT.gunHull);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(sx * 2.85, 0.08, -0.25);
    g.add(pod);
    const intake = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 16), MAT.gunDark);
    intake.position.set(sx * 2.85, 0.08, 0.5);
    g.add(intake);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.2, 12), MAT.engine);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(sx * 2.85, 0.08, -1.02);
    g.add(exhaust);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), MAT.gunDark);
    hub.position.set(sx * 2.85, 0.76, -0.25);
    g.add(hub);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.055, 0.3), MAT.blade);
    rotor.position.set(sx * 2.85, 0.9, -0.25);
    g.add(rotor);
    spin.push(rotor);
    const rotor2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.055, 3.0), MAT.blade);
    rotor2.position.set(sx * 2.85, 0.9, -0.25);
    g.add(rotor2);
    spin.push(rotor2);

    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.6, 8), MAT.gunDark);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(sx * 1.0, -1.02, 0.1);
    g.add(skid);
    for (const dz of [-0.7, 0.7]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), MAT.gunDark);
      strut.position.set(sx * 1.0, -0.76, dz);
      g.add(strut);
    }

    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), MAT.navRed);
    nav.position.set(sx * 3.15, 0.3, -0.25);
    g.add(nav);
  }

  const turretBase = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 10), MAT.gunDark);
  turretBase.position.set(0, -0.92, 0.9);
  g.add(turretBase);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), MAT.gunGlow);
  core.position.set(0, -1.05, 1.15);
  g.add(core);
  for (const sx of [-1, 1]) {
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.0, 8), MAT.gunDark);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(sx * 0.2, -1.0, 1.6);
    g.add(gun);
  }

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.6, 10), MAT.gunHull);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.1, -2.3);
  g.add(boom);
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.9), MAT.gunPlate);
  tailFin.position.set(0, 0.72, -2.75);
  g.add(tailFin);
  for (const sx of [-1, 1]) {
    const stab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.5), MAT.gunPlate);
    stab.position.set(sx * 0.5, 0.2, -2.85);
    g.add(stab);
  }

  return { obj: g, core, spin };
}

/** Flaxan bomber — flying wing that levels city blocks unless intercepted */
function buildBomber(): { obj: THREE.Group; core: THREE.Mesh; spin: THREE.Mesh[]; doors: THREE.Object3D[] } {
  const g = new THREE.Group();
  const doors: THREE.Object3D[] = [];

  // center fuselage bulge
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 2.6, 6, 14), MAT.bombHull);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1, 0.8, 0.9);
  g.add(hull);

  // cockpit
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), MAT.gunGlass);
  canopy.position.set(0, 0.42, 1.15);
  canopy.scale.set(0.8, 0.6, 1.4);
  g.add(canopy);

  // swept wings
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 1.7), MAT.bombHull);
    wing.position.set(sx * 2.4, 0.05, -0.35);
    wing.rotation.y = sx * -0.34;
    g.add(wing);
    const wingTip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.34, 0.9), MAT.bombPlate);
    wingTip.position.set(sx * 3.9, 0.05, -0.95);
    wingTip.rotation.y = sx * -0.34;
    g.add(wingTip);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), MAT.navRed);
    nav.position.set(sx * 4.2, 0.12, -1.0);
    g.add(nav);
    // engine pod
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 1.1, 10), MAT.bombPlate);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(sx * 1.5, -0.28, 0.15);
    g.add(pod);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.22, 10), MAT.engine);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(sx * 1.5, -0.28, -0.5);
    g.add(exhaust);
  }

  // tail
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.26, 0.8), MAT.bombPlate);
  tail.position.set(0, 0.1, -1.9);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.7), MAT.bombPlate);
  fin.position.set(0, 0.5, -1.95);
  g.add(fin);

  // bomb bay doors (animated open)
  for (const sx of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(sx * 0.42, -0.5, 0.2);
    g.add(hinge);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 1.9), MAT.bombBay);
    door.position.set(-sx * 0.4, 0, 0);
    hinge.add(door);
    doors.push(hinge);
  }
  // bay glow (revealed when doors open)
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), MAT.seekGlow);
  core.position.set(0, -0.52, 0.2);
  core.visible = false;
  g.add(core);

  // dorsal turret
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), MAT.bombPlate);
  dome.position.set(0, 0.5, -0.4);
  g.add(dome);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6), MAT.bombBay);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.58, 0.1);
  g.add(barrel);

  return { obj: g, core, spin: [], doors };
}

/** Flaxan siege mech — armoured hover platform with heavy cannons */
function buildMech(): { obj: THREE.Group; core: THREE.Mesh; spin: THREE.Mesh[] } {
  const g = new THREE.Group();

  // torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.35, 1.15), MAT.mechHull);
  torso.position.y = 0.3;
  g.add(torso);
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.28), MAT.mechPlate);
  chestPlate.position.set(0, 0.42, 0.62);
  g.add(chestPlate);
  // visor
  const visor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.1), MAT.mechHot);
  visor.position.set(0, 0.62, 0.74);
  g.add(visor);
  // reactor core
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), MAT.mechGlow);
  core.position.set(0, 0.18, 0.68);
  g.add(core);

  // shoulder pauldrons
  for (const sx of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), MAT.mechPlate);
    pad.position.set(sx * 1.16, 0.78, 0);
    pad.scale.set(1, 0.8, 1);
    g.add(pad);
    // spiked rim
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.07, 8, 16), MAT.mechDark);
    rim.position.set(sx * 1.16, 0.66, 0);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    // cannon arm
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.7, 10), MAT.mechHull);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(sx * 1.16, 0.18, 0.8);
    g.add(arm);
    const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 14), MAT.mechDark);
    muzzleRing.position.set(sx * 1.16, 0.18, 1.66);
    g.add(muzzleRing);
    const muzzleGlow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), MAT.mechHot);
    muzzleGlow.position.set(sx * 1.16, 0.18, 1.7);
    g.add(muzzleGlow);
    // shoulder rocket pod
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.7), MAT.mechPlate);
    pod.position.set(sx * 1.16, 1.22, -0.1);
    g.add(pod);
    for (let i = 0; i < 4; i++) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 6), MAT.mechDark);
      hole.rotation.x = Math.PI / 2;
      hole.position.set(sx * 1.16 + (i % 2 === 0 ? -0.12 : 0.12), 1.3 + (i < 2 ? 0.08 : -0.08), 0.26);
      g.add(hole);
    }
  }

  // hip block + hover legs
  const hips = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.9), MAT.mechPlate);
  hips.position.y = -0.55;
  g.add(hips);
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.6, 4, 10), MAT.mechHull);
    thigh.position.set(sx * 0.55, -1.0, 0);
    g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 4, 10), MAT.mechDark);
    shin.position.set(sx * 0.55, -1.55, 0.05);
    g.add(shin);
    // hover thruster bell
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.24, 10, 1, true), MAT.mechDark);
    jet.position.set(sx * 0.55, -1.86, 0.05);
    g.add(jet);
    const jetGlow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), MAT.engine);
    jetGlow.position.set(sx * 0.55, -1.9, 0.05);
    g.add(jetGlow);
  }

  // antenna
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), MAT.mechDark);
  mast.position.set(0.7, 1.6, -0.3);
  g.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), MAT.navRed);
  beacon.position.set(0.7, 2.16, -0.3);
  g.add(beacon);

  return { obj: g, core, spin: [] };
}

/* ---------------- manager ---------------- */

export class Enemies {
  list: Enemy[] = [];
  boss: Enemy | null = null;
  private nextDash = 1;

  constructor(private scene: THREE.Scene) {}

  spawn(kind: EKind, pos: THREE.Vector3, hpMult: number): Enemy {
    let obj: THREE.Group;
    let core: THREE.Mesh | null = null;
    let rotors: THREE.Mesh[] = [];
    let rig: Rig | null = null;
    let doors: THREE.Object3D[] = [];
    let hp = 20;
    let r = 1.8;

    if (kind === "drone") {
      const m = buildDrone();
      obj = m.obj; core = m.core; rotors = m.spin;
      hp = 26 * hpMult; r = 1.9;
    } else if (kind === "seeker") {
      const m = buildSeeker();
      obj = m.obj; core = m.core; rotors = m.spin;
      hp = 13 * hpMult; r = 1.1;
    } else if (kind === "raptor") {
      const m = buildRaptor();
      obj = m.obj; core = m.core; rotors = m.spin;
      hp = 34 * hpMult; r = 2.2;
    } else if (kind === "gunship") {
      const m = buildGunship();
      obj = m.obj; core = m.core; rotors = m.spin;
      hp = 95 * hpMult; r = 3.4;
    } else if (kind === "bomber") {
      const m = buildBomber();
      obj = m.obj; core = m.core; rotors = m.spin; doors = m.doors;
      hp = 120 * hpMult; r = 3.8;
    } else if (kind === "mech") {
      const m = buildMech();
      obj = m.obj; core = m.core; rotors = m.spin;
      hp = 260 * hpMult; r = 2.8;
    } else {
      rig = new Rig(BOSS_PAL, 1.35);
      obj = new THREE.Group();
      obj.add(rig.group);
      hp = 900 * (0.65 + hpMult * 0.45);
      r = 2.3;
    }

    // materials are shared templates — clone per instance so hit-flash is local
    if (kind !== "boss") {
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material && !Array.isArray(m.material)) {
          m.material = (m.material as THREE.Material).clone();
        }
      });
    }

    // collect emissive mats for pulsing nav lights / cores
    const glowMats: THREE.MeshStandardMaterial[] = [];
    if (kind !== "boss") {
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        const mat = m.material as THREE.MeshStandardMaterial | undefined;
        if (mat && mat.isMeshStandardMaterial && mat.emissive && mat.emissiveIntensity >= 2) {
          glowMats.push(mat);
        }
      });
    }

    obj.position.copy(pos);
    this.scene.add(obj);

    const e: Enemy = {
      kind, obj, rig, core, rotors,
      v: new THREE.Vector3(),
      hp, maxHp: hp, r,
      t: 0, fireT: 1.2 + Math.random() * 1.4,
      state: "chase", stateT: 0,
      seed: Math.random() * 100,
      strafe: Math.random() > 0.5 ? 1 : -1,
      flash: 0, dashMark: 0, dead: false,
      grabbed: false, thrown: 0,
      tumble: new THREE.Vector3(),
      dieT: 0, wreckSpin: new THREE.Vector3(), wreckPop: 0,
      glowMats,
      targetBuilding: null,
      doors,
    };
    if (kind === "raptor") e.state = "lineup";
    if (kind === "bomber") e.state = "cruise";
    if (kind === "mech") e.state = "advance";
    this.list.push(e);
    if (kind === "boss") this.boss = e;
    return e;
  }

  remove(e: Enemy): void {
    this.scene.remove(e.obj);
    e.rig?.dispose();
    if (e.kind !== "boss") {
      e.obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material && !Array.isArray(m.material)) {
          (m.material as THREE.Material).dispose();
        }
      });
    }
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    if (this.boss === e) this.boss = null;
  }

  clear(): void {
    for (const e of [...this.list]) this.remove(e);
    this.list.length = 0;
    this.boss = null;
  }

  markDash(): number {
    return ++this.nextDash;
  }

  update(ctx: EnemyCtx): void {
    const { dt, hero, fx } = ctx;

    for (const e of [...this.list]) {
      if (e.dead) {
        this.updateWreck(e, ctx);
        continue;
      }
      e.t += dt;
      if (e.flash > 0) {
        e.flash = Math.max(0, e.flash - dt);
        const lit = e.flash > 0.001;
        e.obj.traverse((o) => {
          const m = o as THREE.Mesh;
          const mat = m.material as THREE.MeshStandardMaterial | undefined;
          if (mat && mat.isMeshStandardMaterial && mat.emissive) {
            if (lit && !mat.userData.origEm) {
              mat.userData.origEm = mat.emissive.getHex();
              mat.userData.origEi = mat.emissiveIntensity;
              mat.emissive.setHex(0xffffff);
              mat.emissiveIntensity = 1.6;
            } else if (!lit && mat.userData.origEm !== undefined) {
              mat.emissive.setHex(mat.userData.origEm as number);
              mat.emissiveIntensity = mat.userData.origEi as number;
              mat.userData.origEm = undefined;
            }
          }
        });
      } else {
        // nav light / core pulse (skipped while flashing white)
        const pulse = 0.75 + Math.sin(e.t * 6 + e.seed) * 0.25;
        for (const m of e.glowMats) {
          if (m.userData.origEm === undefined && m.emissiveIntensity >= 1.5) {
            m.emissiveIntensity = m.userData.baseEi ?? (m.userData.baseEi = m.emissiveIntensity);
            m.emissiveIntensity = (m.userData.baseEi as number) * pulse;
          }
        }
      }

      // held by the hero: the engine owns the transform this frame
      if (e.grabbed) {
        e.obj.rotation.x += dt * 3;
        e.obj.rotation.z += dt * 2.2;
        continue;
      }

      // hurled by the hero: ballistic tumble, engine resolves the impact
      if (e.thrown > 0) {
        e.thrown -= dt;
        e.v.y -= 42 * dt;
        e.obj.position.addScaledVector(e.v, dt);
        e.obj.rotation.x += e.tumble.x * dt;
        e.obj.rotation.y += e.tumble.y * dt;
        e.obj.rotation.z += e.tumble.z * dt;
        const p = e.obj.position;
        fx.jet(p.x, p.y, p.z, -e.v.x * 0.02, -e.v.y * 0.02, -e.v.z * 0.02,
          0xff9a5a, 3, 12, 0.9, 0.4, 0.3);
        continue;
      }

      _v1.subVectors(hero, e.obj.position);
      const dist = _v1.length() || 1;
      _v1.divideScalar(dist);   // unit vector toward hero

      switch (e.kind) {
        case "drone": this.updateDrone(e, ctx, dist, _v1); break;
        case "seeker": this.updateSeeker(e, ctx, dist, _v1); break;
        case "raptor": this.updateRaptor(e, ctx, dist, _v1); break;
        case "gunship": this.updateGunship(e, ctx, dist, _v1); break;
        case "bomber": this.updateBomber(e, ctx, dist, _v1); break;
        case "mech": this.updateMech(e, ctx, dist, _v1); break;
        case "boss": this.updateBoss(e, ctx, dist, _v1); break;
      }

      // integrate + keep above street level
      e.obj.position.addScaledVector(e.v, dt);
      const floorY = ctx.city.surfaceY(e.obj.position.x, e.obj.position.z) + e.r + 1.5;
      if (e.obj.position.y < floorY) {
        e.obj.position.y = floorY;
        if (e.v.y < 0) e.v.y *= -0.3;
      }
      if (e.obj.position.y > 460) { e.obj.position.y = 460; e.v.y = Math.min(0, e.v.y); }

      // contact damage
      if (!ctx.heroDead && e.kind !== "seeker") {
        const cr = e.r + 1.4;
        if (dist < cr) {
          const dmg =
            e.kind === "boss" ? 17 :
              e.kind === "mech" ? 14 :
                e.kind === "raptor" ? (e.state === "dive" ? 15 : 7) :
                  e.kind === "gunship" ? 12 :
                    e.kind === "bomber" ? 10 : 9;
          ctx.hitPlayer(dmg, e.obj.position);
          e.v.addScaledVector(_v1, -22);
        }
      }
      void fx;
    }
  }

  /* ---------- wreck: dead enemies tumble burning out of the sky ---------- */

  private updateWreck(e: Enemy, ctx: EnemyCtx): void {
    const { dt, fx } = ctx;
    const p = e.obj.position;
    e.dieT += dt;

    if (e.kind === "boss") {
      // the warlord falls in stages — periodic detonations, then the big one
      e.v.y -= 30 * dt;
      e.v.multiplyScalar(Math.exp(-0.4 * dt));
      p.addScaledVector(e.v, dt);
      e.obj.rotation.x += dt * 1.4;
      e.obj.rotation.z += dt * 1.1;
      e.wreckPop -= dt;
      if (e.wreckPop <= 0) {
        e.wreckPop = 0.38;
        fx.flash(p.x, p.y, p.z, 0xffa03c, 7, 0.3);
        fx.spark(p.x, p.y, p.z, 0xffb054, 22, 26, 0.7, 0.6, -8, 1);
        fx.smoke(p.x, p.y, p.z, 6, 7, 3, 0x3a3038, 2.6);
        ctx.sfx("explode", 0.8);
        ctx.shake(4);
      }
      fx.flame(p.x, p.y, p.z, 3, 1.1, 1.6);
      const surf = ctx.city.surfaceY(p.x, p.z);
      if (p.y <= surf + 2 || e.dieT > 3.4) {
        fx.ring(p.x, surf + 1, p.z, 0xff4757, 52, 0.9, true, 2.2);
        fx.flash(p.x, surf + 2, p.z, 0xffd08a, 22, 0.5);
        fx.spark(p.x, surf + 2, p.z, 0xffe27a, 80, 44, 1, 0.9, -20, 0.6);
        fx.smoke(p.x, surf + 2, p.z, 26, 16, 7, 0x6b6070, 4.2);
        ctx.city.spawnDebris(p.x, surf + 1, p.z, 18, 26, 5);
        ctx.sfx("boom", 1.2);
        ctx.shake(12);
        this.remove(e);
      }
      return;
    }

    // regular craft: spin, burn, slam
    e.v.y -= 52 * dt;
    e.v.x *= Math.exp(-0.3 * dt);
    e.v.z *= Math.exp(-0.3 * dt);
    p.addScaledVector(e.v, dt);
    e.obj.rotation.x += e.wreckSpin.x * dt;
    e.obj.rotation.y += e.wreckSpin.y * dt;
    e.obj.rotation.z += e.wreckSpin.z * dt;

    fx.flame(p.x, p.y, p.z, e.kind === "mech" || e.kind === "bomber" ? 3 : 2, 0.9, 1.2);
    if (Math.random() < dt * 18) {
      fx.spark(p.x, p.y, p.z, 0xffb054, 1, 6, 0.35, 0.4, -8, 1);
    }

    const b = ctx.city.collide(p, e.r * 0.8, _v3);
    const surf = ctx.city.surfaceY(p.x, p.z);
    if (b || p.y <= surf + e.r * 0.5 || e.dieT > 4) {
      const heavy = e.kind === "mech" || e.kind === "bomber" || e.kind === "gunship";
      fx.ring(p.x, Math.max(p.y, surf + 1), p.z, 0xffa03c, heavy ? 26 : 14, 0.55, true, 1.5);
      fx.flash(p.x, p.y, p.z, 0xffc070, heavy ? 9 : 5, 0.26);
      fx.spark(p.x, p.y, p.z, 0xffb054, heavy ? 40 : 22, 30, 0.7, 0.55, -14, 0.8);
      fx.smoke(p.x, p.y, p.z, heavy ? 16 : 9, 12, heavy ? 4.5 : 3, 0x8f8490, 3);
      if (heavy) ctx.city.spawnDebris(p.x, p.y, p.z, 8, 18, 3);
      ctx.sfx("wreck", heavy ? 1 : 0.6);
      ctx.shake(heavy ? 6 : 3);
      this.remove(e);
    }
  }

  /* ---------- per-kind AI ---------- */

  private updateDrone(e: Enemy, ctx: EnemyCtx, dist: number, toHero: THREE.Vector3): void {
    const { dt } = ctx;
    for (const s of e.rotors) s.rotation.z += dt * 1.9;
    // orbit at range, bob, snipe
    const orbA = e.seed + e.t * 0.5 * e.strafe;
    _v2.set(
      ctx.hero.x + Math.cos(orbA) * 26,
      ctx.hero.y + 4 + Math.sin(e.t * 1.1 + e.seed) * 5,
      ctx.hero.z + Math.sin(orbA) * 26,
    );
    _v2.sub(e.obj.position).multiplyScalar(1.7 * dt);
    e.v.add(_v2);
    e.v.multiplyScalar(Math.exp(-1.8 * dt));
    const sp = e.v.length();
    if (sp > 30) e.v.multiplyScalar(30 / sp);

    const yaw = Math.atan2(toHero.x, toHero.z);
    e.obj.rotation.y = lerpAngle(e.obj.rotation.y, yaw, Math.min(1, dt * 6));
    e.obj.rotation.z = Math.sin(e.t * 1.6 + e.seed) * 0.18;
    e.obj.rotation.x = -0.12 + Math.sin(e.t * 2.1) * 0.06;
    if (e.core) {
      const k = e.fireT < 0.55 ? 1.4 + Math.sin(e.t * 40) * 0.9 : 1;
      e.core.scale.setScalar(k);
    }

    e.fireT -= dt;
    if (e.fireT <= 0 && dist < 90) {
      e.fireT = 2.6 + Math.random() * 1.6;
      _v2.copy(toHero);
      _v2.addScaledVector(ctx.heroVel, 0.011).normalize();
      const muzzle = e.obj.position.clone().addScaledVector(_v2, 2.2);
      ctx.shoot(muzzle, _v2, 78, 8, 0xff4757, 0.42);
      ctx.fx.jet(muzzle.x, muzzle.y, muzzle.z, _v2.x, _v2.y, _v2.z, 0xff6b7a, 8, 14, 0.5, 0.3, 0.25);
      ctx.sfx("zap", 0.5);
    }
  }

  private updateSeeker(e: Enemy, ctx: EnemyCtx, dist: number, toHero: THREE.Vector3): void {
    const { dt } = ctx;
    const speed = Math.min(72, 26 + e.t * 20);
    // weave slightly so they're harder to line up
    _v2.crossVectors(UP, toHero).multiplyScalar(Math.sin(e.t * 5 + e.seed) * 9);
    _v2.addScaledVector(toHero, speed);
    e.v.lerp(_v2, Math.min(1, dt * 2.4));
    const sp = e.v.length();
    if (sp > speed) e.v.multiplyScalar(speed / sp);

    if (sp > 0.1) {
      _v2.copy(e.v).normalize();
      _q.setFromUnitVectors(FWD, _v2);
      e.obj.quaternion.slerp(_q, Math.min(1, dt * 9));
    }
    const back = e.obj.position.clone().addScaledVector(_v2.copy(e.v).normalize(), -1);
    ctx.fx.jet(back.x, back.y, back.z, -_v2.x, -_v2.y, -_v2.z, dist < 22 ? 0xff4757 : 0xffa04a, 3, 12, 0.7, 0.32, 0.3);

    if (dist < 3.2 || e.t > 16) {
      e.dead = true;
      e.wreckSpin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
      ctx.fx.spark(e.obj.position.x, e.obj.position.y, e.obj.position.z, 0xffb054, 34, 30, 0.6, 0.7, -16, 1);
      ctx.fx.flash(e.obj.position.x, e.obj.position.y, e.obj.position.z, 0xffa03c, 6, 0.28);
      ctx.sfx("explode", 0.7);
      ctx.shake(3.5);
      if (dist < 7) ctx.hitPlayer(14, e.obj.position);
    }
  }

  /** raptor: dogfight strafing runs — lineup → dive through the hero → extend → loop */
  private updateRaptor(e: Enemy, ctx: EnemyCtx, dist: number, toHero: THREE.Vector3): void {
    const { dt } = ctx;
    e.stateT += dt;
    if (e.core) {
      e.core.scale.setScalar(e.state === "dive" ? 1.8 : 1 + Math.sin(e.t * 9) * 0.15);
    }

    switch (e.state) {
      case "lineup": {
        // circle behind and above the hero to build distance for the run
        const ang = e.seed + e.t * 1.1 * e.strafe;
        _v2.set(
          ctx.hero.x + Math.cos(ang) * 62,
          ctx.hero.y + 14 + Math.sin(e.t * 0.9) * 8,
          ctx.hero.z + Math.sin(ang) * 62,
        );
        _v2.sub(e.obj.position).normalize().multiplyScalar(46);
        e.v.lerp(_v2, Math.min(1, dt * 2.2));
        if (dist > 46 && e.stateT > 0.9) {
          e.state = "dive";
          e.stateT = 0;
          // lead the target for the slash pass
          _v2.copy(toHero).multiplyScalar(dist).addScaledVector(ctx.heroVel, 0.6);
          _v2.sub(e.obj.position).normalize();
          e.v.copy(_v2).multiplyScalar(96);
          ctx.sfx("dash", 0.55);
        }
        break;
      }
      case "dive": {
        // hold the lock; tiny correction so it can't be trivially sidestepped
        _v2.copy(e.v).normalize();
        _v3.copy(toHero).multiplyScalar(dist).addScaledVector(ctx.heroVel, 0.35).sub(e.obj.position).normalize();
        _v2.lerp(_v3, Math.min(1, dt * 1.4)).normalize();
        e.v.copy(_v2).multiplyScalar(96);
        // engine wash
        ctx.fx.jet(e.obj.position.x, e.obj.position.y, e.obj.position.z, -_v2.x, -_v2.y, -_v2.z,
          0xff5a6e, 2, 16, 0.6, 0.4, 0.26);
        if (e.stateT > 1.5 || (dist < 6 && e.stateT > 0.25)) {
          e.state = "extend";
          e.stateT = 0;
        }
        break;
      }
      case "extend": {
        e.v.multiplyScalar(Math.exp(-1.1 * dt));
        if (e.stateT > 1.1) {
          e.state = "lineup";
          e.stateT = 0;
          e.strafe = Math.random() > 0.5 ? 1 : -1;
        }
        break;
      }
      default: e.state = "lineup";
    }

    // orient along velocity, bank into turns
    const sp = e.v.length();
    if (sp > 0.5) {
      _v2.copy(e.v).normalize();
      _q.setFromUnitVectors(FWD, _v2);
      e.obj.quaternion.slerp(_q, Math.min(1, dt * 7));
    }
  }

  private updateGunship(e: Enemy, ctx: EnemyCtx, dist: number, toHero: THREE.Vector3): void {
    const { dt } = ctx;
    for (const r of e.rotors) r.rotation.y += dt * 46;

    const want = 52;
    const radial = (dist - want) * 0.9;
    e.v.addScaledVector(toHero, radial * dt);
    _v2.crossVectors(UP, toHero).normalize().multiplyScalar(e.strafe * 16 * dt);
    e.v.add(_v2);
    e.v.y += ((ctx.hero.y + 10) - e.obj.position.y) * 0.7 * dt;
    e.v.multiplyScalar(Math.exp(-1.5 * dt));
    const sp = e.v.length();
    if (sp > 24) e.v.multiplyScalar(24 / sp);

    const yaw = Math.atan2(toHero.x, toHero.z);
    e.obj.rotation.y = lerpAngle(e.obj.rotation.y, yaw, Math.min(1, dt * 3));
    e.obj.rotation.z = -e.strafe * 0.18 + Math.sin(e.t * 1.2) * 0.05;
    e.obj.rotation.x = Math.sin(e.t * 0.9) * 0.05;

    if (e.core) e.core.scale.setScalar(e.fireT < 0.8 ? 1.5 + Math.sin(e.t * 30) * 0.6 : 1);

    e.fireT -= dt;
    if (e.fireT <= 0) {
      e.stateT += dt;
      if (e.stateT > 0.14) {
        e.stateT = 0;
        e.seed += 1;
        const burst = Math.floor(e.seed) % 5;
        if (burst === 4) e.fireT = 3.4 + Math.random();
        _v2.copy(toHero).addScaledVector(ctx.heroVel, 0.008);
        _v2.x += (Math.random() - 0.5) * 0.07;
        _v2.y += (Math.random() - 0.5) * 0.07;
        _v2.z += (Math.random() - 0.5) * 0.07;
        _v2.normalize();
        const muzzle = e.obj.position.clone().addScaledVector(_v2, 3);
        muzzle.y -= 0.7;
        ctx.shoot(muzzle, _v2, 92, 7, 0xc66bff, 0.4);
        ctx.fx.jet(muzzle.x, muzzle.y, muzzle.z, _v2.x, _v2.y, _v2.z, 0xd99bff, 6, 16, 0.4, 0.3, 0.24);
        ctx.sfx("zap", 0.45);
      }
    }
  }

  /** bomber: hunts the tallest standing towers and levels them */
  private updateBomber(e: Enemy, ctx: EnemyCtx, dist: number, toHero: THREE.Vector3): void {
    const { dt } = ctx;
    e.stateT += dt;

    const openDoors = (open: boolean) => {
      for (let i = 0; i < e.doors.length; i++) {
        const d = e.doors[i];
        const want = open ? (i === 0 ? -1.1 : 1.1) : 0;
        d.rotation.z += (want - d.rotation.z) * Math.min(1, dt * 6);
      }
      if (e.core) e.core.visible = open || Math.abs(e.doors[0].rotation.z) > 0.3;
    };

    switch (e.state) {
      case "cruise": {
        openDoors(false);
        // pick the tallest standing building near the action
        if (!e.targetBuilding) {
          let best: { x: number; z: number; top: number } | null = null;
          const near = ctx.city.nearby(ctx.hero.x, ctx.hero.z, []);
          for (const b of near) {
            if (!b.alive || b.top < 34) continue;
            const bd = Math.hypot(b.x - e.obj.position.x, b.z - e.obj.position.z);
            if (bd > 320) continue;
            if (!best || b.top > best.top) best = { x: b.x, z: b.z, top: b.top };
          }
          e.targetBuilding = best ?? { x: ctx.hero.x, z: ctx.hero.z, top: 30 };
        }
        const tb = e.targetBuilding;
        _v2.set(tb.x - e.obj.position.x, (tb.top + 26) - e.obj.position.y, tb.z - e.obj.position.z);
        const d = _v2.length() || 1;
        _v2.divideScalar(d).multiplyScalar(16);
        e.v.lerp(_v2, Math.min(1, dt * 1.4));
        // face travel
        if (e.v.lengthSq() > 1) {
          const yaw = Math.atan2(e.v.x, e.v.z);
          e.obj.rotation.y = lerpAngle(e.obj.rotation.y, yaw, Math.min(1, dt * 2));
        }
        e.obj.rotation.z = Math.sin(e.t * 0.8) * 0.06;
        e.obj.rotation.x = -0.04;
        if (Math.hypot(tb.x - e.obj.position.x, tb.z - e.obj.position.z) < 20 && e.obj.position.y > tb.top + 12) {
          e.state = "bombing";
          e.stateT = 0;
          e.seed = 0;
          ctx.sfx("warn", 0.5);
        }
        break;
      }
      case "bombing": {
        openDoors(true);
        e.v.multiplyScalar(Math.exp(-2.2 * dt));
        e.v.y += (e.targetBuilding!.top + 26 - e.obj.position.y) * 0.5 * dt;
        e.obj.rotation.z = Math.sin(e.t * 3) * 0.03;
        // drop 3 bombs
        if (e.stateT > 0.7 + e.seed * 0.55 && e.seed < 3) {
          e.seed += 1;
          const drop = e.obj.position.clone();
          drop.y -= 0.9;
          _v2.set(e.v.x * 0.5, -6, e.v.z * 0.5);
          _v2.x += (Math.random() - 0.5) * 4;
          _v2.z += (Math.random() - 0.5) * 4;
          ctx.dropBomb(drop, _v2);
          ctx.sfx("grapple", 0.8);
        }
        if (e.seed >= 3 && e.stateT > 2.6) {
          e.state = "reposition";
          e.stateT = 0;
          e.targetBuilding = null;
        }
        break;
      }
      case "reposition": {
        openDoors(false);
        _v2.set(Math.sin(e.seed * 2.3), 0.12, Math.cos(e.seed * 2.3)).multiplyScalar(18);
        e.v.lerp(_v2, Math.min(1, dt * 1.1));
        const yaw = Math.atan2(e.v.x, e.v.z);
        e.obj.rotation.y = lerpAngle(e.obj.rotation.y, yaw, Math.min(1, dt * 2));
        e.obj.rotation.z = Math.sin(e.t * 0.8) * 0.08;
        if (e.stateT > 4) { e.state = "cruise"; e.stateT = 0; }
        break;
      }
    }

    // defensive turret if the hero gets close
    e.fireT -= dt;
    if (e.fireT <= 0 && dist < 42 && !ctx.heroDead) {
      e.fireT = 1.5 + Math.random();
      _v2.copy(toHero).addScaledVector(ctx.heroVel, 0.008).normalize();
      const muzzle = e.obj.position.clone();
      muzzle.y += 0.7;
      ctx.shoot(muzzle, _v2, 84, 6, 0xffb054, 0.36);
      ctx.sfx("zap", 0.4);
    }
  }

  /** mech: slow siege advance + telegraphed heavy cannon + rocket volley */
  private updateMech(e: Enemy, ctx: EnemyCtx, dist: number, toHero: THREE.Vector3): void {
    const { dt } = ctx;
    e.stateT += dt;

    // hover bob
    e.obj.position.y += Math.sin(e.t * 1.6 + e.seed) * 0.5 * dt;
    e.obj.rotation.z = Math.sin(e.t * 1.1) * 0.04;

    const yaw = Math.atan2(toHero.x, toHero.z);
    e.obj.rotation.y = lerpAngle(e.obj.rotation.y, yaw, Math.min(1, dt * 1.8));

    switch (e.state) {
      case "advance": {
        // keep a firing distance
        const want = 58;
        e.v.addScaledVector(toHero, (dist - want) * 0.32 * dt);
        e.v.multiplyScalar(Math.exp(-1.2 * dt));
        const cap = 14;
        if (e.v.length() > cap) e.v.setLength(cap);
        if (dist < 110 && e.stateT > 2.2) {
          e.state = Math.random() < 0.62 ? "charge" : "rockets";
          e.stateT = 0;
          e.fireT = 0;
          if (e.state === "charge") ctx.sfx("charge", 0.7);
        }
        break;
      }
      case "charge": {
        e.v.multiplyScalar(Math.exp(-3 * dt));
        // visor + core burn while charging
        if (e.core) {
          const k = 1 + Math.min(1.6, e.stateT * 2.4) + Math.sin(e.t * 34) * 0.2;
          e.core.scale.setScalar(k);
        }
        if (e.stateT > 0.85) {
          // heavy shell
          _v2.copy(toHero).addScaledVector(ctx.heroVel, 0.012).normalize();
          const muzzle = e.obj.position.clone();
          muzzle.y += 0.2;
          muzzle.addScaledVector(_v2, 1.9);
          ctx.shoot(muzzle, _v2, 58, 15, 0xff7a3c, 0.75);
          ctx.fx.jet(muzzle.x, muzzle.y, muzzle.z, _v2.x, _v2.y, _v2.z, 0xffb054, 10, 18, 0.6, 0.4, 0.3);
          ctx.fx.flash(muzzle.x, muzzle.y, muzzle.z, 0xffc27a, 4, 0.18);
          ctx.sfx("boom", 0.5);
          ctx.shake(2.5);
          e.state = "advance";
          e.stateT = -0.9; // recover delay
          if (e.core) e.core.scale.setScalar(1);
        }
        break;
      }
      case "rockets": {
        e.v.multiplyScalar(Math.exp(-2.4 * dt));
        e.fireT -= dt;
        if (e.fireT <= 0 && e.stateT < 1.1) {
          e.fireT = 0.16;
          _v2.copy(toHero).normalize();
          _v2.x += (Math.random() - 0.5) * 0.12;
          _v2.y += (Math.random() - 0.5) * 0.08;
          _v2.z += (Math.random() - 0.5) * 0.12;
          _v2.normalize();
          const muzzle = e.obj.position.clone();
          muzzle.y += 1.3;
          muzzle.x += (Math.random() - 0.5) * 1.4;
          muzzle.z += (Math.random() - 0.5) * 1.4;
          ctx.shoot(muzzle, _v2, 66, 9, 0xffd23f, 0.5);
          ctx.sfx("zap", 0.5);
        }
        if (e.stateT > 1.6) { e.state = "advance"; e.stateT = 0; }
        break;
      }
      default: e.state = "advance";
    }
  }

  private updateBoss(e: Enemy, ctx: EnemyCtx, dist: number, toHero: THREE.Vector3): void {
    const { dt } = ctx;
    const rig = e.rig!;
    const enraged = e.hp < e.maxHp * 0.32;
    const spdM = enraged ? 1.35 : 1;
    e.stateT += dt;

    let pose = POSES.fly;
    let blendK = 6;

    switch (e.state) {
      case "chase": {
        _v2.copy(toHero).multiplyScalar(58 * spdM * dt);
        e.v.add(_v2);
        e.v.y += ((ctx.hero.y + 3) - e.obj.position.y) * 1.1 * dt;
        e.v.multiplyScalar(Math.exp(-1.7 * dt));
        const cap = 42 * spdM;
        if (e.v.length() > cap) e.v.setLength(cap);
        pose = e.v.length() > 16 ? POSES.fist : POSES.hover;
        if (e.stateT > 2.2 / spdM) {
          e.stateT = 0;
          const roll = Math.random();
          if (dist < 46 && roll < 0.5) { e.state = "aim"; ctx.sfx("warn", 0.5); }
          else if (roll < 0.78) { e.state = "volley"; e.fireT = 0.25; }
          else { e.state = "risehigh"; }
        }
        break;
      }
      case "aim": {
        e.v.multiplyScalar(Math.exp(-5 * dt));
        pose = POSES.slamUp;
        blendK = 11;
        rig.setEyeGlow(0xff3326, 3.4);
        if (e.stateT > 0.55 / spdM) {
          e.state = "dashpunch";
          e.stateT = 0;
          e.v.copy(toHero).multiplyScalar(118 * spdM);
          ctx.sfx("dash", 0.9);
          ctx.fx.ring(e.obj.position.x, e.obj.position.y, e.obj.position.z, 0xff4757, 16, 0.45, false, 1.5);
        }
        break;
      }
      case "dashpunch": {
        pose = POSES.fist;
        blendK = 14;
        const p = e.obj.position;
        ctx.fx.jet(p.x, p.y, p.z, -e.v.x * 0.02, -e.v.y * 0.02, -e.v.z * 0.02, 0xff6a5a, 4, 14, 0.8, 0.4, 0.3);
        ctx.city.smashThrough(p, 4, ctx.fx, 20);
        if (dist < 4.2) {
          ctx.hitPlayer(24, p);
          ctx.shake(9);
          ctx.fx.flash(p.x, p.y, p.z, 0xffd0a0, 5, 0.2);
          e.state = "recover"; e.stateT = 0;
          e.v.multiplyScalar(0.15);
        }
        if (e.stateT > 0.6) { e.state = "recover"; e.stateT = 0; e.v.multiplyScalar(0.25); }
        break;
      }
      case "recover": {
        e.v.multiplyScalar(Math.exp(-3 * dt));
        pose = POSES.hover;
        rig.setEyeGlow(enraged ? 0xff3326 : 0xffe27a, enraged ? 2.6 : 1.4);
        if (e.stateT > 0.75 / spdM) { e.state = "chase"; e.stateT = 0; }
        break;
      }
      case "volley": {
        pose = POSES.blast;
        blendK = 9;
        _v2.copy(toHero).multiplyScalar((dist - 44) * 0.85 * dt);
        e.v.add(_v2);
        e.v.multiplyScalar(Math.exp(-2.2 * dt));
        e.fireT -= dt;
        if (e.fireT <= 0) {
          e.fireT = 0.5 / spdM;
          const hand = e.obj.position.clone();
          hand.y += 1.4;
          hand.addScaledVector(toHero, 1.6);
          for (let s = -1; s <= 1; s++) {
            _v2.copy(toHero);
            const ang = s * 0.1;
            const cs = Math.cos(ang), sn = Math.sin(ang);
            const nx = _v2.x * cs - _v2.z * sn;
            const nz = _v2.x * sn + _v2.z * cs;
            _v2.set(nx, _v2.y, nz).normalize();
            ctx.shoot(hand, _v2, 104, 11, 0xff4757, 0.55);
          }
          ctx.fx.flash(hand.x, hand.y, hand.z, 0xff6a5a, 2.4, 0.14);
          ctx.sfx("zap", 0.7);
          if (e.stateT > (enraged ? 3.6 : 2.7)) { e.state = "chase"; e.stateT = 0; }
        }
        break;
      }
      case "risehigh": {
        pose = POSES.fly;
        e.v.y += 60 * dt;
        e.v.x *= Math.exp(-2 * dt);
        e.v.z *= Math.exp(-2 * dt);
        if (e.obj.position.y > ctx.hero.y + 34 || e.stateT > 1.5) {
          e.state = "groundslam";
          e.stateT = 0;
          e.v.set(0, -150 * spdM, 0);
          e.obj.position.x += (ctx.hero.x - e.obj.position.x) * 0.6;
          e.obj.position.z += (ctx.hero.z - e.obj.position.z) * 0.6;
          ctx.sfx("warn", 0.8);
        }
        break;
      }
      case "groundslam": {
        pose = POSES.slamDown;
        blendK = 13;
        const surf = ctx.city.surfaceY(e.obj.position.x, e.obj.position.z);
        if (e.obj.position.y <= surf + 3 || e.stateT > 2.4) {
          const p = e.obj.position.clone();
          p.y = surf + 1;
          ctx.slamBlast(p, 46, 34);
          ctx.sfx("slam", 1);
          ctx.shake(16);
          e.v.set(0, 12, 0);
          e.state = "recover";
          e.stateT = 0;
        }
        break;
      }
    }

    const faceDir = e.state === "dashpunch" ? _v2.copy(e.v).normalize() : toHero;
    const yaw = Math.atan2(faceDir.x, faceDir.z);
    e.obj.rotation.y = lerpAngle(e.obj.rotation.y, yaw, Math.min(1, dt * 8));

    const flat = Math.hypot(e.v.x, e.v.z);
    const pitch = e.state === "groundslam" ? 0.22
      : e.state === "dashpunch" ? 1.15
        : Math.min(1.15, flat * 0.022);
    rig.body.rotation.x += (pitch - rig.body.rotation.x) * Math.min(1, dt * 6);

    rig.blendPose(pose, Math.min(1, dt * blendK));
    rig.addFlutter(ctx.time, Math.min(1, flat * 0.02));
    rig.updateCape(dt, e.v.length(), ctx.time);
    rig.setAura(enraged, 0xff3326, enraged ? 0.26 + Math.sin(ctx.time * 8) * 0.07 : 0);
    if (enraged && Math.random() < dt * 26) {
      const p = e.obj.position;
      ctx.fx.spark(p.x + (Math.random() - 0.5) * 3, p.y + 1 + (Math.random() - 0.5) * 3, p.z + (Math.random() - 0.5) * 3,
        0xff3326, 1, 4, 0.4, 0.5, 4, 1);
    }
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
