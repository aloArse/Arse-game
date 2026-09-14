// ==================== Space layer: stars, planets, orbital flight ====================
// Fly above ~1250m → the sky falls away to a starfield and you can reach
// other planets (and dive back to Earth). Fully procedural.

import * as THREE from "three";

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export interface Planet {
  name: string;
  pos: THREE.Vector3;
  r: number;
  group: THREE.Group;
  spin: number;
  gravity: number; // extra downward pull near surface (keeps you grounded feel)
}

function planetTexture(base: string, b1: string, b2: string, spots: string, nSpots: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, b1);
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, b2);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  // horizontal turbulent bands
  for (let i = 0; i < 46; i++) {
    const y = Math.random() * 256;
    const h = 2 + Math.random() * 12;
    g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4);
    g.lineTo(512, y + h); g.lineTo(0, y + h);
    g.closePath(); g.fill();
  }
  // blotches / craters / storms
  for (let i = 0; i < nSpots; i++) {
    const x = Math.random() * 512, y = 30 + Math.random() * 196;
    const r = 4 + Math.random() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, spots);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SpaceLayer {
  group = new THREE.Group();
  planets: Planet[] = [];
  private stars!: THREE.Points;
  private starMat!: THREE.PointsMaterial;
  private dust!: THREE.Points;
  private dustMat!: THREE.PointsMaterial;

  constructor(scene: THREE.Scene, quality: number) {
    // ---- real 3D starfield on a far shell ----
    const n = Math.round(2600 * quality);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(2200 + Math.random() * 260);
      pos[i * 3] = v.x; pos[i * 3 + 1] = Math.abs(v.y) * 0.9 + 60; pos[i * 3 + 2] = v.z;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const sc = document.createElement("canvas");
    sc.width = sc.height = 32;
    const scg = sc.getContext("2d")!;
    const scgr = scg.createRadialGradient(16, 16, 0, 16, 16, 15);
    scgr.addColorStop(0, "rgba(255,255,255,1)");
    scgr.addColorStop(0.35, "rgba(220,230,255,0.7)");
    scgr.addColorStop(1, "rgba(200,215,255,0)");
    scg.fillStyle = scgr; scg.fillRect(0, 0, 32, 32);
    this.starMat = new THREE.PointsMaterial({
      size: 9, map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0,
      depthWrite: false, fog: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    // ---- floating space dust (parallax near the hero) ----
    const nd = Math.round(220 * quality);
    const dpos = new Float32Array(nd * 3);
    for (let i = 0; i < nd; i++) {
      dpos[i * 3] = (Math.random() - 0.5) * 700;
      dpos[i * 3 + 1] = 1100 + Math.random() * 1800;
      dpos[i * 3 + 2] = (Math.random() - 0.5) * 700;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    this.dustMat = new THREE.PointsMaterial({
      color: 0x9fc8ff, size: 2.2, transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    this.dust = new THREE.Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);

    // ---- planets ----
    this.addPlanet("کویر سرخ", 1500, 2600, -1900, 190, 0.9,
      planetTexture("#c96a3f", "#e8a06a", "#8f4529", "rgba(60,28,16,0.5)", 34), 0xffb98a, 1.6);
    this.addPlanet("غول حلقه‌دار", -2900, 2150, 1500, 260, 0.5,
      planetTexture("#d8b37e", "#f0d9a8", "#a8834e", "rgba(120,85,40,0.4)", 22), 0xffe2b0, 1.2, true);
    this.addPlanet("دنیای یخی", 2400, 1750, 2500, 120, 1.4,
      planetTexture("#9fd8e8", "#e8fbff", "#5f9fc0", "rgba(255,255,255,0.6)", 18), 0xbfefff, 1.1);
    this.addPlanet("سیارهٔ سبز", -2100, 2850, -2500, 150, 0.7,
      planetTexture("#5fae6a", "#b8e8a8", "#2f6e46", "rgba(20,60,30,0.5)", 26), 0xa8ffc0, 1.3);

    scene.add(this.group);
  }

  private addPlanet(name: string, x: number, y: number, z: number, r: number, spin: number,
                    tex: THREE.CanvasTexture, atmo: number, gravity = 1, ring = false): void {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(r, 48, 32),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.05, fog: false }),
    );
    g.add(body);
    // atmosphere shell
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.06, 48, 32),
      new THREE.MeshBasicMaterial({ color: atmo, transparent: true, opacity: 0.16, fog: false,
        blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false }),
    );
    g.add(shell);
    if (ring) {
      const rc = document.createElement("canvas");
      rc.width = 256; rc.height = 16;
      const rg = rc.getContext("2d")!;
      for (let i = 0; i < 256; i++) {
        const a = 0.25 + 0.6 * Math.abs(Math.sin(i * 0.16)) * (i > 30 && i < 235 ? 1 : 0.25);
        rg.fillStyle = `rgba(232,214,180,${a.toFixed(3)})`;
        rg.fillRect(i, 0, 1, 16);
      }
      const rt = new THREE.CanvasTexture(rc);
      rt.colorSpace = THREE.SRGBColorSpace;
      const ringM = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.35, r * 2.05, 96),
        new THREE.MeshBasicMaterial({ map: rt, transparent: true, opacity: 0.9, side: THREE.DoubleSide, fog: false, depthWrite: false }),
      );
      ringM.rotation.x = Math.PI / 2 - 0.32;
      g.add(ringM);
    }
    g.position.set(x, y, z);
    this.group.add(g);
    this.planets.push({ name, pos: g.position.clone(), r, group: g, spin, gravity });
  }

  /** 0 at sea level → 1 fully in space */
  fadeAt(y: number): number {
    return clamp((y - 950) / 420, 0, 1);
  }

  /** height of planet ground beneath a position, or null */
  surfaceUnder(p: THREE.Vector3): { y: number; planet: Planet } | null {
    for (const pl of this.planets) {
      const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < pl.r * pl.r) {
        const top = pl.pos.y + Math.sqrt(pl.r * pl.r - d2);
        if (Math.abs(p.y - top) < pl.r * 1.5) return { y: top, planet: pl };
      }
    }
    return null;
  }

  nearestPlanet(p: THREE.Vector3): { planet: Planet; dist: number } | null {
    let best: Planet | null = null, bd = Infinity;
    for (const pl of this.planets) {
      const d = pl.pos.distanceTo(p);
      if (d < bd) { bd = d; best = pl; }
    }
    return best ? { planet: best, dist: bd } : null;
  }

  update(dt: number, camPos: THREE.Vector3, heroY: number): void {
    const fade = this.fadeAt(heroY);
    this.starMat.opacity = fade;
    this.dustMat.opacity = fade * 0.75;
    // stars follow the camera so the shell never ends
    this.stars.position.set(camPos.x, 0, camPos.z);
    // gentle twinkle via size pulse
    this.starMat.size = 8.4 + Math.sin(performance.now() * 0.0012) * 1.4;
    for (const pl of this.planets) pl.group.rotation.y += dt * pl.spin * 0.05;
  }
}
