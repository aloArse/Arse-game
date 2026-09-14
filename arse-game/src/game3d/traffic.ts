// ==================== Living city: traffic + pedestrians ====================
// Cars drive the road grid, pedestrians walk the sidewalks — and panic
// when a superhuman fight lands nearby. Fully procedural, instanced pools.

import * as THREE from "three";

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

interface Car {
  mesh: THREE.Group;
  axis: 0 | 1;          // 0 = drive along X, 1 = along Z
  dir: 1 | -1;
  lane: number;         // world coordinate of the road it drives on
  speed: number;
  t: number;            // position along the road
  alarm: number;
}

interface Ped {
  mesh: THREE.Group;
  homeX: number; homeZ: number;
  x: number; z: number;
  dir: number;
  speed: number;
  phase: number;
  alarm: number;
  legL?: THREE.Mesh; legR?: THREE.Mesh; armL?: THREE.Mesh; armR?: THREE.Mesh;
}

function carTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = color; g.fillRect(0, 0, 64, 32);
  g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(14, 4, 36, 10);
  g.fillStyle = "rgba(180,220,255,0.5)"; g.fillRect(16, 5, 14, 8); g.fillRect(34, 5, 14, 8);
  return new THREE.CanvasTexture(c);
}

export class Traffic {
  group = new THREE.Group();
  cars: Car[] = [];
  peds: Ped[] = [];
  private half: number;

  constructor(scene: THREE.Scene, cityHalf: number, cell: number, quality: number) {
    this.half = cityHalf;
    const roads: number[] = [];
    for (let r = -cityHalf + cell / 2; r <= cityHalf; r += cell) roads.push(r);

    // ---- cars ----
    const colors = ["#d94f4f", "#4f7fd9", "#d9b44f", "#59b36a", "#b9b9c4", "#8a5fd0", "#e07840", "#3fb8b0"];
    const nCars = Math.round(26 * quality);
    for (let i = 0; i < nCars; i++) {
      const g = new THREE.Group();
      const col = colors[i % colors.length];
      const tex = carTexture(col);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 1.5, 2.2),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.35 }),
      );
      body.position.y = 0.85;
      g.add(body);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 1.1, 2.0),
        new THREE.MeshStandardMaterial({ color: 0x18202e, roughness: 0.15, metalness: 0.5 }),
      );
      cabin.position.set(-0.2, 1.9, 0);
      g.add(cabin);
      // lights
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.4, 1.7),
        new THREE.MeshBasicMaterial({ color: 0xfff2c8 }),
      );
      head.position.set(2.32, 0.85, 0);
      g.add(head);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.32, 1.6),
        new THREE.MeshBasicMaterial({ color: 0xff3a3a }),
      );
      tail.position.set(-2.32, 0.9, 0);
      g.add(tail);
      // wheels
      const wgeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 10);
      const wmat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9 });
      for (const [wx, wz] of [[1.5, 1.05], [1.5, -1.05], [-1.5, 1.05], [-1.5, -1.05]]) {
        const w = new THREE.Mesh(wgeo, wmat);
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.42, wz);
        g.add(w);
      }
      this.group.add(g);
      this.cars.push({
        mesh: g,
        axis: Math.random() > 0.5 ? 0 : 1,
        dir: Math.random() > 0.5 ? 1 : -1,
        lane: roads[Math.floor(Math.random() * roads.length)] + (Math.random() > 0.5 ? 4.2 : -4.2),
        speed: 16 + Math.random() * 14,
        t: (Math.random() - 0.5) * cityHalf * 2,
        alarm: 0,
      });
    }

    // ---- pedestrians (simple articulated walkers) ----
    const nPeds = Math.round(42 * quality);
    const shirt = [0xd94f6a, 0x4f9fd9, 0xd9c04f, 0x6ad98a, 0xc47fd0, 0xe08a50, 0x8ab6c4];
    for (let i = 0; i < nPeds; i++) {
      const g = new THREE.Group();
      const sx = shirt[i % shirt.length];
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.34, 0.62, 4, 8),
        new THREE.MeshStandardMaterial({ color: sx, roughness: 0.8 }),
      );
      body.position.y = 1.28;
      g.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8b094, roughness: 0.85 }),
      );
      head.position.y = 1.95;
      g.add(head);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.9 });
      const mkLimb = (len: number, r: number): THREE.Mesh =>
        new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 6), legMat);
      const legL = mkLimb(0.5, 0.12); legL.position.set(0.15, 0.55, 0);
      const legR = mkLimb(0.5, 0.12); legR.position.set(-0.15, 0.55, 0);
      const armL = mkLimb(0.42, 0.09); armL.position.set(0.42, 1.35, 0);
      const armR = mkLimb(0.42, 0.09); armR.position.set(-0.42, 1.35, 0);
      armL.material = new THREE.MeshStandardMaterial({ color: sx, roughness: 0.8 });
      armR.material = armL.material as THREE.MeshStandardMaterial;
      g.add(legL, legR, armL, armR);
      this.group.add(g);
      // spawn near a random road (sidewalk offset)
      const road = roads[Math.floor(Math.random() * roads.length)];
      const along = (Math.random() - 0.5) * cityHalf * 1.9;
      const side = Math.random() > 0.5 ? 9.5 : -9.5;
      const px = Math.random() > 0.5 ? road + side : along;
      const pz = px === road + side ? along : road + side;
      this.peds.push({
        mesh: g, homeX: px, homeZ: pz, x: px, z: pz,
        dir: Math.random() > 0.5 ? 1 : -1,
        speed: 1.5 + Math.random() * 0.9,
        phase: Math.random() * 9, alarm: 0,
        legL, legR, armL, armR,
      });
    }

    scene.add(this.group);
  }

  /** scare everyone near a world position (explosion / hero landing) */
  panicAt(x: number, z: number, radius = 34): void {
    for (const p of this.peds) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) { p.alarm = Math.max(p.alarm, 4 + (1 - d / radius) * 4); }
    }
    for (const c of this.cars) {
      const cx = c.axis === 0 ? c.t : c.lane;
      const cz = c.axis === 0 ? c.lane : c.t;
      if (Math.hypot(cx - x, cz - z) < radius * 1.4) c.alarm = Math.max(c.alarm, 3);
    }
  }

  update(dt: number, heroPos: THREE.Vector3): void {
    const h = this.half + 30;
    for (const c of this.cars) {
      if (c.alarm > 0) { c.alarm -= dt; c.speed = Math.min(34, c.speed + dt * 26); }
      else c.speed += (clamp(c.speed, 16, 30) - c.speed) * dt;
      c.t += c.dir * c.speed * dt;
      if (c.t > h) c.t = -h;
      if (c.t < -h) c.t = h;
      const x = c.axis === 0 ? c.t : c.lane;
      const z = c.axis === 0 ? c.lane : c.t;
      c.mesh.position.set(x, 0, z);
      c.mesh.rotation.y = c.axis === 0 ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }

    for (const p of this.peds) {
      const dHero = Math.hypot(p.x - heroPos.x, p.z - heroPos.z);
      if (dHero < 18 && heroPos.y < 12) p.alarm = Math.max(p.alarm, 3);
      const fleeing = p.alarm > 0;
      if (fleeing) p.alarm -= dt;
      const spd = fleeing ? p.speed * 3.4 : p.speed;
      // walk along the sidewalk; flee directly away from the hero
      if (fleeing && dHero > 0.1) {
        const ux = (p.x - heroPos.x) / dHero, uz = (p.z - heroPos.z) / dHero;
        p.x += ux * spd * dt; p.z += uz * spd * dt;
        p.dir = Math.atan2(ux, uz);
      } else {
        p.x += Math.sin(p.dir) * 0 + Math.cos(p.phase) * 0; // (kept simple below)
        const axis = Math.abs(p.homeX - Math.round(p.homeX / 78) * 78) < 12 ? 0 : 1;
        if (axis === 0) p.z += spd * dt * (Math.sin(p.phase) > 0 ? 1 : -1);
        else p.x += spd * dt * (Math.cos(p.phase) > 0 ? 1 : -1);
        p.dir = axis === 0 ? Math.PI / 2 : 0;
        // stay near home block
        if (Math.hypot(p.x - p.homeX, p.z - p.homeZ) > 60) { p.x = p.homeX; p.z = p.homeZ; }
      }
      p.phase += dt * (fleeing ? 14 : 6.5);
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.dir;
      // limb swing
      const s = Math.sin(p.phase) * (fleeing ? 0.9 : 0.55);
      if (p.legL) p.legL.rotation.x = s;
      if (p.legR) p.legR.rotation.x = -s;
      if (p.armL) p.armL.rotation.x = -s * 0.8;
      if (p.armR) p.armR.rotation.x = s * 0.8;
    }
  }
}
