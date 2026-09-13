// ---------- Destructible 3D city: instanced slab towers, debris physics, collapse ----------
import * as THREE from "three";
import type { FX } from "./fx";

export const CELL = 78;
// 15x15 keeps the skyline dense while staying below mobile WebGL memory
// limits. The previous 17x17 layout could allocate invisible overflow towers.
export const GRID = 15;
export const CITY_HALF = (CELL * GRID) / 2;

const MAX_SLABS = 1380;
const MAX_PROPS = 480;
const MAX_DEBRIS = 680;

const GRAV = -62;

interface Slab {
  b: number;
  alive: boolean;
  falling: boolean;
  pending: number;       // >0 = losing support, will drop when it hits 0
  sag: number;           // pre-collapse groan/tilt
  rest: number;          // rubble linger timer
  p: THREE.Vector3;
  p0: THREE.Vector3;     // original position (for sag + reset)
  s: THREE.Vector3;
  q: THREE.Quaternion;
  v: THREE.Vector3;
  av: THREE.Vector3;
  scale: number;
  idx: number;           // floor index within the building
  leanX: number;         // groan tilt direction (set during collapse)
  leanZ: number;
}

interface Prop {
  b: number;
  alive: boolean;
  p: THREE.Vector3;
  s: THREE.Vector3;
  ry: number;
}

export interface Building {
  id: number;
  x: number; z: number;
  w: number; d: number; h: number;
  hp: number; maxHp: number;
  slabs: number[];
  props: number[];
  top: number;           // current standing height
  alive: boolean;
  tint: THREE.Color;     // facade tint (darkens with damage)
}

interface Debris {
  active: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  av: THREE.Vector3;
  life: number;
  scale: number;
  size: THREE.Vector3;
  col: THREE.Color;
}

/** lingering fire burning in the rubble after a collapse */
interface Fire {
  p: THREE.Vector3;
  life: number;
  intensity: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _col = new THREE.Color();

/* ---------------- textures ---------------- */

function facadeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#20263f";
  g.fillRect(0, 0, 128, 256);
  // vertical mullions
  g.fillStyle = "#171c30";
  for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 3, 256);
  // window rows
  for (let y = 6; y < 256; y += 16) {
    for (let x = 4; x < 128; x += 16) {
      const r = Math.random();
      if (r > 0.42) {
        const warm = r > 0.82;
        g.fillStyle = warm ? "#ffd79a" : "#9fd8ff";
        g.globalAlpha = 0.55 + Math.random() * 0.45;
      } else {
        g.fillStyle = "#0e1223";
        g.globalAlpha = 1;
      }
      g.fillRect(x, y, 10, 9);
    }
  }
  g.globalAlpha = 1;
  // floor bands
  g.fillStyle = "rgba(10,14,28,0.85)";
  for (let y = 0; y < 256; y += 16) g.fillRect(0, y + 13, 128, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function emissiveTexture(src: THREE.CanvasTexture): THREE.CanvasTexture {
  // reuse the same canvas but keep only bright windows
  const img = src.image as HTMLCanvasElement;
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (lum < 120) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; }
  }
  g.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rubbleTexture(): THREE.CanvasTexture {
  // concrete slab faces with faint window ghosts + rebar streaks
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8d8d94";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "20,20,30"},${Math.random() * 0.09})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  // broken window impressions
  for (let y = 8; y < 128; y += 26) {
    for (let x = 8; x < 128; x += 26) {
      g.fillStyle = "rgba(30,34,48,0.55)";
      g.fillRect(x, y, 14, 11);
      g.fillStyle = "rgba(160,190,220,0.25)";
      g.fillRect(x + 2, y + 2, 4, 3);
    }
  }
  // rebar streaks
  g.strokeStyle = "rgba(90,70,55,0.8)";
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * 128;
    g.beginPath();
    g.moveTo(x, Math.random() * 40);
    g.lineTo(x + (Math.random() - 0.5) * 30, 128);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  // asphalt
  g.fillStyle = "#1b1d27";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // block (sidewalk + plaza) inset
  g.fillStyle = "#2a2d3a";
  g.fillRect(26, 26, 204, 204);
  g.fillStyle = "#343848";
  g.fillRect(32, 32, 192, 192);
  // curbs
  g.strokeStyle = "rgba(200,210,230,0.22)";
  g.lineWidth = 2;
  g.strokeRect(26, 26, 204, 204);
  // lane markings on the road band
  g.strokeStyle = "rgba(255,205,90,0.5)";
  g.lineWidth = 3;
  g.setLineDash([16, 14]);
  g.beginPath();
  g.moveTo(0, 13); g.lineTo(256, 13);
  g.moveTo(0, 243); g.lineTo(256, 243);
  g.moveTo(13, 0); g.lineTo(13, 256);
  g.moveTo(243, 0); g.lineTo(243, 256);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(GRID, GRID);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ---------------- city ---------------- */

export class City {
  buildings: Building[] = [];
  slabs: Slab[] = [];
  props: Prop[] = [];
  debris: Debris[] = [];
  fires: Fire[] = [];
  demolished = 0;

  private slabMesh!: THREE.InstancedMesh;
  private propMesh!: THREE.InstancedMesh;
  private debrisMesh!: THREE.InstancedMesh;
  private cellMap = new Map<number, number[]>();
  private slabDirty = true;
  private debrisHead = 0;
  private group = new THREE.Group();
  private scratchA: Building[] = [];
  private scratchB: Building[] = [];
  private scratchC: Building[] = [];

  constructor(private scene: THREE.Scene) {
    const facade = facadeTexture();
    const emis = emissiveTexture(facade);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const slabMat = new THREE.MeshStandardMaterial({
      map: facade,
      emissiveMap: emis,
      emissive: new THREE.Color(0xffc98a),
      emissiveIntensity: 1.15,
      roughness: 0.72,
      metalness: 0.16,
    });
    this.slabMesh = new THREE.InstancedMesh(boxGeo, slabMat, MAX_SLABS);
    this.slabMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.slabMesh.frustumCulled = false;
    this.slabMesh.castShadow = false;
    this.group.add(this.slabMesh);

    const propMat = new THREE.MeshStandardMaterial({ color: 0x2f3547, roughness: 0.85, metalness: 0.25 });
    this.propMesh = new THREE.InstancedMesh(boxGeo, propMat, MAX_PROPS);
    this.propMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.propMesh.frustumCulled = false;
    this.group.add(this.propMesh);

    const debMat = new THREE.MeshStandardMaterial({
      map: rubbleTexture(), color: 0xffffff,
      roughness: 0.88, metalness: 0.12,
    });
    this.debrisMesh = new THREE.InstancedMesh(boxGeo, debMat, MAX_DEBRIS);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.frustumCulled = false;
    this.group.add(this.debrisMesh);

    for (let i = 0; i < MAX_DEBRIS; i++) {
      this.debris.push({
        active: false, p: new THREE.Vector3(), v: new THREE.Vector3(),
        q: new THREE.Quaternion(), av: new THREE.Vector3(),
        life: 0, scale: 1, size: new THREE.Vector3(1, 1, 1),
        col: new THREE.Color(0x9a9aa4),
      });
      this.debrisMesh.setColorAt(i, this.debris[i].col);
    }
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;

    // ground
    const gTex = groundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL * GRID * 3, CELL * GRID * 3),
      new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.95, metalness: 0.05, color: 0x9aa0b4 }),
    );
    gTex.repeat.set(GRID * 3, GRID * 3);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = false;
    this.group.add(ground);

    scene.add(this.group);
    this.build();
  }

  /* ---------- generation ---------- */

  private build(): void {
    let slabIdx = 0;
    let propIdx = 0;
    const half = (GRID - 1) / 2;

    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const cx = (gx - half) * CELL;
        const cz = (gz - half) * CELL;
        const distC = Math.hypot(cx, cz) / (CITY_HALF || 1);
        // downtown is taller
        const tallBias = Math.max(0, 1 - distC * 1.15);
        if (Math.random() < 0.07) continue; // occasional plaza / park

        const w = 26 + Math.random() * 22;
        const d = 26 + Math.random() * 22;
        const h = 26 + Math.pow(Math.random(), 1.6) * (60 + tallBias * 210);
        const n = Math.max(3, Math.min(10, Math.round(h / 26)));
        const sh = h / n;

        // Never create a collision-only building after the instance pool fills.
        if (slabIdx + n > MAX_SLABS) continue;

        const tint = new THREE.Color().setHSL(
          0.58 + (Math.random() - 0.5) * 0.12,
          0.16 + Math.random() * 0.22,
          0.36 + Math.random() * 0.22,
        );

        const b: Building = {
          id: this.buildings.length,
          x: cx + (Math.random() - 0.5) * 10,
          z: cz + (Math.random() - 0.5) * 10,
          w, d, h,
          hp: 60 + h * 1.7,
          maxHp: 60 + h * 1.7,
          slabs: [], props: [], top: h, alive: true,
          tint,
        };

        for (let i = 0; i < n && slabIdx < MAX_SLABS; i++) {
          // setback taper for the upper third
          const f = i / n;
          const taper = f > 0.62 ? 1 - (f - 0.62) * 0.75 : 1;
          const sw = w * taper;
          const sd = d * taper;
          const slab: Slab = {
            b: b.id, alive: true, falling: false, pending: 0, sag: 0, rest: 0,
            p: new THREE.Vector3(b.x, sh * (i + 0.5), b.z),
            p0: new THREE.Vector3(b.x, sh * (i + 0.5), b.z),
            s: new THREE.Vector3(sw, sh * 1.002, sd),
            q: new THREE.Quaternion(),
            v: new THREE.Vector3(), av: new THREE.Vector3(),
            scale: 1, idx: i, leanX: 0, leanZ: 0,
          };
          this.slabs.push(slab);
          b.slabs.push(slabIdx);
          this.slabMesh.setColorAt(slabIdx, tint);
          slabIdx++;
        }

        // rooftop props (AC units, spire, mast)
        const pc = 1 + (Math.random() * 3 | 0);
        for (let i = 0; i < pc && propIdx < MAX_PROPS; i++) {
          const spire = i === 0 && h > 120 && Math.random() > 0.45;
          const pw = spire ? 1.6 : 3 + Math.random() * 5;
          const ph = spire ? 14 + Math.random() * 22 : 2 + Math.random() * 4;
          const pd = spire ? 1.6 : 3 + Math.random() * 5;
          const topW = w * 0.5 * 0.72;
          const prop: Prop = {
            b: b.id, alive: true,
            p: new THREE.Vector3(
              b.x + (Math.random() - 0.5) * topW * 1.2,
              h + ph / 2,
              b.z + (Math.random() - 0.5) * topW * 1.2,
            ),
            s: new THREE.Vector3(pw, ph, pd),
            ry: Math.random() * Math.PI,
          };
          this.props.push(prop);
          b.props.push(propIdx);
          propIdx++;
        }

        this.buildings.push(b);
        const key = this.cellKey(b.x, b.z);
        const arr = this.cellMap.get(key);
        if (arr) arr.push(b.id);
        else this.cellMap.set(key, [b.id]);
      }
    }

    // park unused instances
    for (let i = slabIdx; i < MAX_SLABS; i++) {
      _m.makeScale(0, 0, 0);
      this.slabMesh.setMatrixAt(i, _m);
    }
    for (let i = propIdx; i < MAX_PROPS; i++) {
      _m.makeScale(0, 0, 0);
      this.propMesh.setMatrixAt(i, _m);
    }
    for (let i = 0; i < MAX_DEBRIS; i++) {
      _m.makeScale(0, 0, 0);
      this.debrisMesh.setMatrixAt(i, _m);
    }

    this.syncSlabs();
    this.syncProps();
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.slabMesh.instanceColor) this.slabMesh.instanceColor.needsUpdate = true;
  }

  private cellKey(x: number, z: number): number {
    const gx = Math.round(x / CELL) + 64;
    const gz = Math.round(z / CELL) + 64;
    return gx * 1000 + gz;
  }

  /* ---------- instance sync ---------- */

  private syncSlabs(): void {
    for (let i = 0; i < this.slabs.length; i++) {
      const s = this.slabs[i];
      if (!s.alive) {
        _m.makeScale(0, 0, 0);
      } else {
        _s.copy(s.s).multiplyScalar(s.scale);
        _m.compose(s.p, s.q, _s);
      }
      this.slabMesh.setMatrixAt(i, _m);
    }
    this.slabMesh.instanceMatrix.needsUpdate = true;
  }

  private syncProps(): void {
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      if (!p.alive) {
        _m.makeScale(0, 0, 0);
      } else {
        _e.set(0, p.ry, 0);
        _q.setFromEuler(_e);
        _m.compose(p.p, _q, p.s);
      }
      this.propMesh.setMatrixAt(i, _m);
    }
    this.propMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- queries ---------- */

  nearby(x: number, z: number, out: Building[]): Building[] {
    out.length = 0;
    const gx = Math.round(x / CELL);
    const gz = Math.round(z / CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = this.cellMap.get((gx + i + 64) * 1000 + (gz + j + 64));
        if (!arr) continue;
        for (const id of arr) {
          const b = this.buildings[id];
          if (b.alive) out.push(b);
        }
      }
    }
    return out;
  }

  /** highest solid surface at a world xz (building roof or street) */
  surfaceY(x: number, z: number): number {
    const tmp = this.scratchA;
    this.nearby(x, z, tmp);
    let y = 0;
    for (const b of tmp) {
      if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) {
        y = Math.max(y, b.top);
      }
    }
    return y;
  }

  /** sphere vs building boxes; returns push-out vector or null */
  collide(p: THREE.Vector3, r: number, out: THREE.Vector3): Building | null {
    const tmp = this.scratchB;
    this.nearby(p.x, p.z, tmp);
    for (const b of tmp) {
      if (b.top <= 0.5) continue;
      const hw = b.w / 2, hd = b.d / 2;
      const cx = Math.max(b.x - hw, Math.min(p.x, b.x + hw));
      const cy = Math.max(0, Math.min(p.y, b.top));
      const cz = Math.max(b.z - hd, Math.min(p.z, b.z + hd));
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2);
        if (d > 1e-4) {
          out.set(dx / d, dy / d, dz / d).multiplyScalar(r - d);
        } else {
          // deep inside: push out along the shallowest axis
          const px = hw + r - Math.abs(p.x - b.x);
          const pz = hd + r - Math.abs(p.z - b.z);
          const py = b.top + r - p.y;
          if (py < px && py < pz) out.set(0, py, 0);
          else if (px < pz) out.set(Math.sign(p.x - b.x) * px, 0, 0);
          else out.set(0, 0, Math.sign(p.z - b.z) * pz);
        }
        return b;
      }
    }
    return null;
  }

  /* ---------- destruction ---------- */

  spawnDebris(x: number, y: number, z: number, n: number, spd: number, size: number, color?: THREE.Color): void {
    for (let i = 0; i < n; i++) {
      const idx = this.debrisHead;
      const d = this.debris[idx];
      this.debrisHead = (this.debrisHead + 1) % MAX_DEBRIS;
      d.active = true;
      d.p.set(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, z + (Math.random() - 0.5) * size);
      const a = Math.random() * Math.PI * 2;
      const up = 0.3 + Math.random();
      const s = spd * (0.4 + Math.random());
      d.v.set(Math.cos(a) * s, up * s * 0.8, Math.sin(a) * s);
      d.av.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
      d.q.identity();
      d.life = 4.5 + Math.random() * 3;
      d.scale = 1;
      const sz = size * (0.12 + Math.random() * 0.3);
      // mix chunky blocks with long rebar-ish shards
      const shard = Math.random() < 0.22;
      if (shard) d.size.set(sz * 0.3, sz * (0.3 + Math.random() * 0.4), sz * (2.2 + Math.random() * 2));
      else d.size.set(sz, sz * (0.5 + Math.random()), sz * (0.7 + Math.random() * 0.7));
      d.col.copy(color ?? _col.setHex(0x9a9aa4));
      this.debrisMesh.setColorAt(idx, d.col);
    }
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
  }

  /** knock a single slab loose; everything above it loses support and pancakes down */
  private breakSlab(idx: number, fx: FX, ix: number, iy: number, iz: number, power: number): void {
    const s = this.slabs[idx];
    if (!s.alive || s.falling) return;
    s.falling = true;
    s.pending = 0;
    s.rest = 7 + Math.random() * 4;
    const dx = s.p.x - ix, dz = s.p.z - iz;
    const l = Math.hypot(dx, dz) || 1;
    s.v.set(
      (dx / l) * power * (0.5 + Math.random() * 0.7) + (Math.random() - 0.5) * 6,
      6 + Math.random() * power * 0.55,
      (dz / l) * power * (0.5 + Math.random() * 0.7) + (Math.random() - 0.5) * 6,
    );
    s.av.set((Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.6);

    const b = this.buildings[s.b];

    // ---- progressive collapse ----
    // Floors above only lose support when the core is already compromised:
    // either the base floors are gone, or the frame is critically damaged.
    const baseGone = s.idx <= 1;
    const critical = b.hp < b.maxHp * 0.42;
    let above = 0;
    if (baseGone || critical) {
      for (const j of b.slabs) {
        const u = this.slabs[j];
        if (!u.alive || u.falling || u.pending > 0) continue;
        if (u.idx > s.idx) {
          above++;
          // staggered pancake — lower floors go first
          u.pending = 0.075 * above + Math.random() * 0.05;
        }
      }
    }
    b.top = this.computeTop(b);
    if (above > 0 && b.alive) {
      b.hp = 0;
      b.alive = false;
      this.demolished++;
      this.collapseFx(b, s.p.x, s.p.y, s.p.z, fx);
    }

    // ---- fracture debris + dust + glass ----
    const big = Math.max(s.s.x, s.s.z);
    this.spawnDebris(s.p.x, s.p.y, s.p.z, 8, 17, big * 0.85, b.tint);
    fx.smoke(s.p.x, s.p.y, s.p.z, 11, 10, big * 0.4, 0x9a8f9c, 2.6);
    fx.spark(s.p.x, s.p.y, s.p.z, 0xbfe6ff, 20, 19, 0.3, 0.7, -14, 1);
    fx.spark(s.p.x, s.p.y, s.p.z, 0xffd9a0, 8, 12, 0.35, 0.45, -10, 1);
    void iy;
  }

  /** the big cinematic moment when a tower gives way */
  private collapseFx(b: Building, px: number, py: number, pz: number, fx: FX): void {
    fx.ring(b.x, 1.2, b.z, 0xffd2a0, b.w * 5.0, 0.95, true, 2.2);
    fx.ring(b.x, 1.2, b.z, 0xffffff, b.w * 2.8, 0.6, true, 1.3);
    fx.flash(px, py, pz, 0xffb070, b.w * 0.9, 0.3);
    // dust skirt punched out at street level
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = b.w * (0.45 + Math.random() * 0.8);
      fx.smoke(b.x + Math.cos(a) * rr, 2 + Math.random() * 12, b.z + Math.sin(a) * rr,
        13, 14, 8.5, 0xa2969c, 4.8);
    }
    fx.smoke(b.x, b.h * 0.45, b.z, 20, 10, 9, 0x9c9098, 4.2);
    fx.spark(b.x, py, b.z, 0xffc978, 30, 26, 0.7, 1.0, -22, 1);
    // fires licking through the rubble pile
    const nf = 2 + (Math.random() * 3 | 0);
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = b.w * (0.2 + Math.random() * 0.5);
      this.addFire(b.x + Math.cos(a) * rr, 1.5 + Math.random() * 3, b.z + Math.sin(a) * rr,
        14 + Math.random() * 10, 0.7 + Math.random() * 0.6);
    }
  }

  /** register a lingering fire in the wreckage */
  addFire(x: number, y: number, z: number, life: number, intensity: number): void {
    if (this.fires.length >= 16) this.fires.shift();
    this.fires.push({ p: new THREE.Vector3(x, y, z), life, intensity });
  }

  private computeTop(b: Building): number {
    let top = 0;
    for (const i of b.slabs) {
      const s = this.slabs[i];
      if (s.alive && !s.falling) top = Math.max(top, s.p.y + s.s.y / 2);
    }
    return top;
  }

  /** damage a building at a point; chips slabs off and may trigger a full collapse */
  damage(b: Building, dmg: number, point: THREE.Vector3, fx: FX, power = 26): boolean {
    if (!b.alive) return false;
    b.hp -= dmg;

    // scorch + structural soot: the facade darkens as the frame fails
    const wear = 0.5 + 0.5 * Math.max(0, b.hp) / b.maxHp;
    _col.copy(b.tint).multiplyScalar(wear);
    for (const i of b.slabs) {
      const s = this.slabs[i];
      if (s.alive && !s.falling) this.slabMesh.setColorAt(i, _col);
    }
    if (this.slabMesh.instanceColor) this.slabMesh.instanceColor.needsUpdate = true;

    // concrete chips + a sheet of glass bursting out of the impact face
    fx.spark(point.x, point.y, point.z, 0xffd9a0, 10, 14, 0.3, 0.45, -18, 1);
    fx.spark(point.x, point.y, point.z, 0xbfe6ff, 12, 17, 0.28, 0.6, -14, 1);
    fx.smoke(point.x, point.y, point.z, 5, 6, 2.2, 0xa99c9c, 1.6);
    this.spawnDebris(point.x, point.y, point.z, 3, 13, 3, b.tint);

    if (b.hp <= 0) {
      this.collapse(b, point, fx);
      return true;
    }

    // chip the slab nearest the impact height (top-down crumble)
    let best = -1;
    let bestD = Infinity;
    for (const i of b.slabs) {
      const s = this.slabs[i];
      if (!s.alive || s.falling) continue;
      const d = Math.abs(s.p.y - point.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    // only heavy blows shear a whole floor off; light fire just wears the tower down
    if (best >= 0 && dmg >= 30) {
      this.breakSlab(best, fx, point.x, point.y, point.z, power);
      this.slabDirty = true;
    }
    return false;
  }

  /** total structural failure — everything falls */
  collapse(b: Building, point: THREE.Vector3, fx: FX): void {
    if (!b.alive) return;
    b.alive = false;
    b.hp = 0;
    this.demolished++;

    for (const i of b.slabs) {
      const s = this.slabs[i];
      if (!s.alive || s.falling) continue;
      // pancake: low floors blow out first, upper floors follow
      s.pending = s.idx * 0.055 + Math.random() * 0.05;
      s.rest = 8 + Math.random() * 5;
      const dx = s.p.x - point.x, dz = s.p.z - point.z;
      const l = Math.hypot(dx, dz) || 1;
      const hK = s.p.y / Math.max(1, b.h);
      s.v.set(
        (dx / l) * (7 + Math.random() * 16) + (Math.random() - 0.5) * 10,
        4 + hK * 17 + Math.random() * 9,
        (dz / l) * (7 + Math.random() * 16) + (Math.random() - 0.5) * 10,
      );
      s.av.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 3);
      // lean away from the killing blow while the frame groans
      s.leanX = (dz / l) * 0.55;
      s.leanZ = -(dx / l) * 0.55;
    }
    for (const i of b.props) {
      const p = this.props[i];
      if (!p.alive) continue;
      p.alive = false;
      this.spawnDebris(p.p.x, p.p.y, p.p.z, 4, 20, p.s.x * 1.4, b.tint);
    }
    b.top = 0;

    // spectacular collapse fx
    this.collapseFx(b, point.x, Math.min(point.y, b.h), point.z, fx);
    this.spawnDebris(b.x, b.h * 0.4, b.z, 26, 26, b.w * 0.85, b.tint);
    this.slabDirty = true;
  }

  /** area blast: damages / levels everything within radius */
  blast(center: THREE.Vector3, radius: number, dmg: number, fx: FX): number {
    let destroyed = 0;
    const tmp: Building[] = [];
    // scan a wider neighbourhood for big blasts
    const reach = Math.ceil(radius / CELL) + 1;
    const gx = Math.round(center.x / CELL);
    const gz = Math.round(center.z / CELL);
    const seen = new Set<number>();
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        const arr = this.cellMap.get((gx + i + 64) * 1000 + (gz + j + 64));
        if (!arr) continue;
        for (const id of arr) {
          if (seen.has(id)) continue;
          seen.add(id);
          const b = this.buildings[id];
          if (b.alive) tmp.push(b);
        }
      }
    }
    for (const b of tmp) {
      const dx = b.x - center.x, dz = b.z - center.z;
      const d = Math.hypot(dx, dz);
      if (d > radius + b.w * 0.5) continue;
      const falloff = 1 - Math.min(1, d / (radius + b.w * 0.5));
      _v.set(b.x, Math.min(b.top, center.y), b.z);
      if (this.damage(b, dmg * (0.45 + falloff), _v, fx, 34 * falloff + 8)) destroyed++;
    }
    // scorch the blast zone
    if (radius > 24) {
      this.addFire(center.x + (Math.random() - 0.5) * radius * 0.5, 1.4, center.z + (Math.random() - 0.5) * radius * 0.5,
        10 + Math.random() * 8, 0.8);
    }
    return destroyed;
  }

  /** carve a tunnel through whatever the hero smashes into */
  /**
   * LOCALIZED impact destruction: only the slabs actually touched by the
   * impact volume shatter — a fist-sized crater, not a whole-building hit.
   * The building only comes down when structural integrity actually fails
   * (too many floors lost / core floors gone / hp depleted) — then the
   * existing pancake-collapse physics takes over.
   * Returns the number of slabs destroyed.
   */
  gouge(point: THREE.Vector3, radius: number, fx: FX, power = 24, maxSlabs = 5): number {
    const tmp = this.scratchC;
    this.nearby(point.x, point.z, tmp);
    let destroyed = 0;
    for (const b of tmp) {
      if (!b.alive) continue;
      const total = b.slabs.length;
      let broke = 0;
      for (const i of b.slabs) {
        if (destroyed + broke >= maxSlabs) break;
        const s = this.slabs[i];
        if (!s.alive || s.falling) continue;
        const dx = Math.abs(s.p.x - point.x) - s.s.x / 2;
        const dy = Math.abs(s.p.y - point.y) - s.s.y / 2;
        const dz = Math.abs(s.p.z - point.z) - s.s.z / 2;
        const d = Math.hypot(Math.max(0, dx), Math.max(0, dy), Math.max(0, dz));
        if (d < radius) {
          this.breakSlab(i, fx, point.x, point.y, point.z, power);
          broke++;
        }
      }
      if (broke > 0) {
        destroyed += broke;
        // structural cost proportional to how much of the frame was lost
        b.hp -= (broke / total) * b.maxHp * 1.25;
        b.top = this.computeTop(b);
        this.slabDirty = true;
        // material blasted out of the exact contact point
        fx.spark(point.x, point.y, point.z, 0xffd9a0, 14, 18, 0.4, 0.35, -16, 0.8);
        fx.spark(point.x, point.y, point.z, 0xbfe6ff, 10, 20, 0.24, 0.5, -12, 1);
        fx.chunk(point.x, point.y, point.z, 0xb9b2a6, 6, 14, 0.8, 1.4);
        fx.smoke(point.x, point.y, point.z, 4, 5, 2.4, 0xa99c9c, 1.6);
        // integrity check: did the frame lose too much?
        let alive = 0, baseAlive = 0;
        for (const i of b.slabs) {
          const s = this.slabs[i];
          if (!s.alive || s.falling) continue;
          alive++;
          if (s.idx <= 1) baseAlive++;
        }
        const lostFrac = 1 - alive / total;
        const baseGone = b.slabs.length > 3 && baseAlive === 0;
        if (b.hp <= 0 || lostFrac > 0.42 || baseGone) {
          this.collapse(b, point, fx);
        }
      }
    }
    return destroyed;
  }

  smashThrough(p: THREE.Vector3, radius: number, fx: FX, power: number): number {
    let hits = 0;
    const tmp = this.scratchC;
    this.nearby(p.x, p.z, tmp);
    for (const b of tmp) {
      if (!b.alive) continue;
      for (const i of b.slabs) {
        const s = this.slabs[i];
        if (!s.alive || s.falling) continue;
        const dx = Math.abs(s.p.x - p.x) - s.s.x / 2;
        const dy = Math.abs(s.p.y - p.y) - s.s.y / 2;
        const dz = Math.abs(s.p.z - p.z) - s.s.z / 2;
        const d = Math.hypot(Math.max(0, dx), Math.max(0, dy), Math.max(0, dz));
        if (d < radius) {
          this.breakSlab(i, fx, p.x, p.y, p.z, power);
          hits++;
        }
      }
      if (hits > 0) {
        b.hp -= 55;
        b.top = this.computeTop(b);
        if (b.hp <= 0 || b.top <= 0.5) {
          this.collapse(b, p, fx);
        }
        this.slabDirty = true;
        break;
      }
    }
    return hits;
  }

  /* ---------- simulation ---------- */

  update(dt: number, fx: FX): void {
    let moved = false;

    // slabs that lost support: groan, sag, then let go
    for (let i = 0; i < this.slabs.length; i++) {
      const s = this.slabs[i];
      if (s.pending <= 0 || !s.alive || s.falling) continue;
      moved = true;
      s.pending -= dt;
      s.sag = Math.min(1, s.sag + dt * 3.2);
      // shudder + settle downward, tilting as the frame fails
      s.p.x = s.p0.x + (Math.random() - 0.5) * 0.22 * s.sag;
      s.p.z = s.p0.z + (Math.random() - 0.5) * 0.22 * s.sag;
      s.p.y = s.p0.y - s.sag * 0.5 - s.sag * s.sag * 0.4;
      _e.set(s.leanX * s.sag * s.sag * 0.16, 0, s.leanZ * s.sag * s.sag * 0.16);
      s.q.setFromEuler(_e);
      if (s.pending <= 0) {
        s.falling = true;
        s.pending = 0;
        if (s.rest <= 0) s.rest = 7 + Math.random() * 4;
        const b = this.buildings[s.b];
        b.top = this.computeTop(b);
        const big = Math.max(s.s.x, s.s.z);
        this.spawnDebris(s.p.x, s.p.y, s.p.z, 5, 14, big * 0.7, b.tint);
        fx.smoke(s.p.x, s.p.y, s.p.z, 7, 9, big * 0.36, 0x9a8f9c, 2.4);
        fx.spark(s.p.x, s.p.y, s.p.z, 0xbfe6ff, 12, 16, 0.28, 0.6, -14, 1);
      }
    }

    // falling slabs
    for (let i = 0; i < this.slabs.length; i++) {
      const s = this.slabs[i];
      if (!s.falling || !s.alive) continue;
      moved = true;
      s.v.y += GRAV * dt;
      s.p.addScaledVector(s.v, dt);

      // spin
      if (s.av.lengthSq() > 1e-5) {
        _e.set(s.av.x * dt, s.av.y * dt, s.av.z * dt);
        _q.setFromEuler(_e);
        s.q.premultiply(_q);
      }

      const floor = s.s.y / 2;
      if (s.p.y <= floor) {
        s.p.y = floor;
        if (s.v.y < -14) {
          // slab hits the street: fractures apart, dust wave, shrapnel, glass
          const b = this.buildings[s.b];
          const big = Math.max(s.s.x, s.s.z);
          const hard = s.v.y < -38;
          fx.smoke(s.p.x, 1.5, s.p.z, 12, 13, big * 0.5, 0xa89ca0, 3.4);
          fx.ring(s.p.x, 0.7, s.p.z, 0xd9c2a8, big * 2.8, 0.6, true, 1.2);
          fx.spark(s.p.x, 1.2, s.p.z, 0xffd0a0, 10, 15, 0.35, 0.4, -18, 0.35);
          fx.spark(s.p.x, 1.2, s.p.z, 0xbfe6ff, hard ? 18 : 8, 16, 0.26, 0.55, -12, 1);
          this.spawnDebris(s.p.x, 2, s.p.z, hard ? 9 : 6, 13, big * 0.55, b.tint);
          if (hard && Math.random() < 0.3) {
            this.addFire(s.p.x + (Math.random() - 0.5) * big, 1.2, s.p.z + (Math.random() - 0.5) * big,
              8 + Math.random() * 6, 0.5);
          }
        }
        s.v.y = -s.v.y * 0.22;
        s.v.x *= 0.62;
        s.v.z *= 0.62;
        s.av.multiplyScalar(0.5);
        if (Math.abs(s.v.y) < 2.5) {
          s.v.y = 0;
          s.av.multiplyScalar(0.2);
          // settle flat-ish
          s.q.slerp(_q.identity(), Math.min(1, dt * 3));
        }
      }

      s.rest -= dt;
      if (s.rest <= 0) {
        s.scale -= dt * 0.55;
        if (s.scale <= 0.02) {
          s.alive = false;
          s.falling = false;
          s.scale = 1;
        }
      }
    }

    if (moved || this.slabDirty) {
      this.syncSlabs();
      if (this.slabDirty) this.syncProps();
      this.slabDirty = false;
    }

    // lingering fires feeding on the wreckage
    if (this.fires.length > 0) {
      for (let i = this.fires.length - 1; i >= 0; i--) {
        const f = this.fires[i];
        f.life -= dt;
        if (f.life <= 0) { this.fires.splice(i, 1); continue; }
        // roars at full strength, gutters out near the end
        const heat = Math.min(1, f.life / 3) * f.intensity;
        if (Math.random() < dt * (6 + heat * 12)) {
          fx.flame(f.p.x, f.p.y, f.p.z, 2, 1.1 + heat * 0.9, 2.4);
        }
      }
    }

    // debris
    let dMoved = false;
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const d = this.debris[i];
      if (!d.active) continue;
      dMoved = true;
      d.life -= dt;
      d.v.y += GRAV * dt;
      d.p.addScaledVector(d.v, dt);
      _e.set(d.av.x * dt, d.av.y * dt, d.av.z * dt);
      _q.setFromEuler(_e);
      d.q.premultiply(_q);
      const floor = d.size.y / 2;
      if (d.p.y <= floor) {
        d.p.y = floor;
        d.v.y = -d.v.y * 0.32;
        d.v.x *= 0.7;
        d.v.z *= 0.7;
        d.av.multiplyScalar(0.6);
      }
      if (d.life <= 0) {
        d.scale -= dt * 1.6;
        if (d.scale <= 0.02) {
          d.active = false;
          d.scale = 1;
          _m.makeScale(0, 0, 0);
          this.debrisMesh.setMatrixAt(i, _m);
          continue;
        }
      }
      _s.copy(d.size).multiplyScalar(d.scale);
      _m.compose(d.p, d.q, _s);
      this.debrisMesh.setMatrixAt(i, _m);
    }
    if (dMoved) this.debrisMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- reset ---------- */

  reset(): void {
    this.demolished = 0;
    this.fires.length = 0;
    for (const b of this.buildings) {
      b.alive = true;
      b.hp = b.maxHp;
      b.top = b.h;
    }
    let si = 0;
    for (const b of this.buildings) {
      const n = b.slabs.length;
      for (let i = 0; i < n; i++) {
        const s = this.slabs[b.slabs[i]];
        s.alive = true;
        s.falling = false;
        s.pending = 0;
        s.sag = 0;
        s.rest = 0;
        s.scale = 1;
        s.leanX = 0;
        s.leanZ = 0;
        s.p.copy(s.p0);
        s.q.identity();
        s.v.set(0, 0, 0);
        s.av.set(0, 0, 0);
        this.slabMesh.setColorAt(b.slabs[i], b.tint);
        si++;
      }
      for (const pi of b.props) this.props[pi].alive = true;
    }
    if (this.slabMesh.instanceColor) this.slabMesh.instanceColor.needsUpdate = true;
    void si;
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const d = this.debris[i];
      d.active = false;
      d.scale = 1;
      _m.makeScale(0, 0, 0);
      this.debrisMesh.setMatrixAt(i, _m);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    this.syncSlabs();
    this.syncProps();
  }

  dispose(): void {
    this.scene.remove(this.group);
  }
}
