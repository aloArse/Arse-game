// ---------- 3D effects: GPU sparks, dust, shockwave rings, flashes, ribbon trail ----------
import * as THREE from "three";

const SPARK_MAX = 2600;
const DUST_MAX = 1400;
const RING_MAX = 26;
const FLASH_MAX = 22;

const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.06, d);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

interface Pool {
  pts: THREE.Points;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  max: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  grow: Float32Array;
  head: number;
  count: number;
  geo: THREE.BufferGeometry;
}

function makePool(n: number, additive: boolean): Pool {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  // park unused particles far away
  for (let i = 0; i < n; i++) pos[i * 3 + 1] = -9999;
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const mat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = additive ? 5 : 4;

  return {
    pts, pos, col, size, alpha, geo,
    vel: new Float32Array(n * 3),
    life: new Float32Array(n),
    max: new Float32Array(n),
    grav: new Float32Array(n),
    drag: new Float32Array(n),
    grow: new Float32Array(n),
    head: 0, count: n,
  };
}

function poolEmit(
  p: Pool, x: number, y: number, z: number,
  vx: number, vy: number, vz: number,
  r: number, g: number, b: number,
  size: number, life: number, grav: number, drag: number, grow: number,
): void {
  const i = p.head;
  p.head = (p.head + 1) % p.count;
  p.pos[i * 3] = x; p.pos[i * 3 + 1] = y; p.pos[i * 3 + 2] = z;
  p.vel[i * 3] = vx; p.vel[i * 3 + 1] = vy; p.vel[i * 3 + 2] = vz;
  p.col[i * 3] = r; p.col[i * 3 + 1] = g; p.col[i * 3 + 2] = b;
  p.size[i] = size;
  p.alpha[i] = 1;
  p.life[i] = life;
  p.max[i] = life;
  p.grav[i] = grav;
  p.drag[i] = drag;
  p.grow[i] = grow;
}

function poolUpdate(p: Pool, dt: number): void {
  const { pos, vel, life, max, alpha, size, grav, drag, grow, count } = p;
  for (let i = 0; i < count; i++) {
    if (life[i] <= 0) continue;
    life[i] -= dt;
    if (life[i] <= 0) {
      alpha[i] = 0;
      pos[i * 3 + 1] = -9999;
      continue;
    }
    const d = Math.exp(-drag[i] * dt);
    vel[i * 3] *= d;
    vel[i * 3 + 1] = vel[i * 3 + 1] * d + grav[i] * dt;
    vel[i * 3 + 2] *= d;
    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    size[i] += grow[i] * dt;
    const k = life[i] / max[i];
    alpha[i] = k > 0.8 ? (1 - k) * 5 : k / 0.8;
  }
  p.geo.attributes.position.needsUpdate = true;
  p.geo.attributes.aColor.needsUpdate = true;
  p.geo.attributes.aSize.needsUpdate = true;
  p.geo.attributes.aAlpha.needsUpdate = true;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number; max: number;
  rate: number;
  active: boolean;
  mat: THREE.MeshBasicMaterial;
}

interface Flash {
  mesh: THREE.Mesh;
  life: number; max: number;
  rate: number;
  active: boolean;
  mat: THREE.MeshBasicMaterial;
}

export class FX {
  group = new THREE.Group();
  private sparks: Pool;
  private dust: Pool;
  private rings: Ring[] = [];
  private flashes: Flash[] = [];
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.sparks = makePool(SPARK_MAX, true);
    this.dust = makePool(DUST_MAX, false);
    this.group.add(this.sparks.pts, this.dust.pts);

    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < RING_MAX; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, life: 0, max: 1, rate: 1, active: false });
    }

    const sphGeo = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < FLASH_MAX; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(sphGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.flashes.push({ mesh, mat, life: 0, max: 1, rate: 1, active: false });
    }

    scene.add(this.group);
  }

  // ---------- emitters ----------

  spark(
    x: number, y: number, z: number, color: number, n: number,
    spd: number, size = 0.5, life = 0.5, grav = -6, spreadY = 1,
  ): void {
    this.c.set(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const v = spd * (0.3 + Math.random() * 0.9);
      poolEmit(
        this.sparks, x, y, z,
        Math.cos(a) * s * v, u * v * spreadY, Math.sin(a) * s * v,
        this.c.r, this.c.g, this.c.b,
        size * (0.55 + Math.random() * 0.9),
        life * (0.5 + Math.random() * 0.8),
        grav, 1.6, 0,
      );
    }
  }

  /** directional cone of sparks */
  jet(
    x: number, y: number, z: number, dx: number, dy: number, dz: number,
    color: number, n: number, spd: number, spread: number, size = 0.4, life = 0.4,
  ): void {
    this.c.set(color);
    for (let i = 0; i < n; i++) {
      const v = spd * (0.5 + Math.random() * 0.8);
      poolEmit(
        this.sparks, x, y, z,
        (dx + (Math.random() - 0.5) * spread) * v,
        (dy + (Math.random() - 0.5) * spread) * v,
        (dz + (Math.random() - 0.5) * spread) * v,
        this.c.r, this.c.g, this.c.b,
        size * (0.6 + Math.random() * 0.8),
        life * (0.6 + Math.random() * 0.7),
        -2, 2.2, 0,
      );
    }
  }

  smoke(x: number, y: number, z: number, n: number, spd: number, size: number, color = 0x8c8296, life = 2.2): void {
    this.c.set(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = (Math.random() - 0.2) * 1.1;
      const s = Math.sqrt(Math.max(0, 1 - Math.min(1, u * u)));
      const v = spd * (0.2 + Math.random());
      const tint = 0.72 + Math.random() * 0.4;
      poolEmit(
        this.dust, x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, z + (Math.random() - 0.5) * size,
        Math.cos(a) * s * v, Math.abs(u) * v * 0.75 + 1.2, Math.sin(a) * s * v,
        this.c.r * tint, this.c.g * tint, this.c.b * tint,
        size * (0.7 + Math.random() * 0.9),
        life * (0.6 + Math.random() * 0.7),
        1.2, 1.15, size * 1.5,
      );
    }
  }

  /**
   * Living fire: additive flame tongues that rise and cool from white-hot
   * through orange to deep red, plus drifting embers and dark smoke.
   */
  flame(x: number, y: number, z: number, n: number, size: number, spread = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      const ox = x + Math.cos(a) * r;
      const oz = z + Math.sin(a) * r;
      // colour ramp: 0 = white-hot core, 1 = red edge
      const k = Math.random();
      const cr = 1;
      const cg = 0.95 - k * 0.72;
      const cb = 0.82 - k * 0.82;
      poolEmit(
        this.sparks, ox, y + Math.random() * size * 0.4, oz,
        (Math.random() - 0.5) * 1.6 + Math.cos(a) * 0.6,
        2.4 + Math.random() * 3.2,
        (Math.random() - 0.5) * 1.6 + Math.sin(a) * 0.6,
        cr, cg, Math.max(0.05, cb),
        size * (0.5 + Math.random() * 0.7),
        0.45 + Math.random() * 0.4,
        3.4, 0.7, size * 1.1,
      );
      // embers
      if (Math.random() < 0.3) {
        poolEmit(
          this.sparks, ox, y + size * 0.4, oz,
          (Math.random() - 0.5) * 5, 5 + Math.random() * 8, (Math.random() - 0.5) * 5,
          1, 0.75, 0.35,
          0.24, 0.8 + Math.random() * 0.9,
          2.2, 0.5, 0,
        );
      }
      // smoke cap
      if (Math.random() < 0.4) {
        poolEmit(
          this.dust, ox, y + size * 0.8, oz,
          (Math.random() - 0.5) * 2.2, 3.2 + Math.random() * 2.4, (Math.random() - 0.5) * 2.2,
          0.13, 0.12, 0.13,
          size * (0.8 + Math.random()), 1.6 + Math.random() * 1.4,
          1.4, 0.9, size * 2.2,
        );
      }
    }
  }

  /** expanding shockwave ring. axis: "y" = flat on ground, "billboard" handled by caller rotation */
  ring(
    x: number, y: number, z: number, color: number,
    maxR: number, dur: number, flat: boolean, width = 1,
  ): void {
    const r = this.rings.find((q) => !q.active);
    if (!r) return;
    r.active = true;
    r.life = dur;
    r.max = dur;
    r.rate = maxR / dur;
    r.mat.color.set(color);
    r.mat.opacity = 0.95;
    r.mesh.visible = true;
    r.mesh.position.set(x, y, z);
    r.mesh.scale.setScalar(0.6);
    r.mesh.userData.width = width;
    r.mesh.userData.flat = flat;
    if (flat) r.mesh.rotation.set(-Math.PI / 2, 0, 0);
    else r.mesh.rotation.set(0, 0, Math.random() * Math.PI);
  }

  flash(x: number, y: number, z: number, color: number, maxR: number, dur: number): void {
    const f = this.flashes.find((q) => !q.active);
    if (!f) return;
    f.active = true;
    f.life = dur;
    f.max = dur;
    f.rate = maxR / dur;
    f.mat.color.set(color);
    f.mat.opacity = 0.9;
    f.mesh.visible = true;
    f.mesh.position.set(x, y, z);
    f.mesh.scale.setScalar(maxR * 0.25);
  }

  update(dt: number, camera: THREE.Camera): void {
    poolUpdate(this.sparks, dt);
    poolUpdate(this.dust, dt);

    for (const r of this.rings) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.active = false;
        r.mesh.visible = false;
        r.mat.opacity = 0;
        continue;
      }
      const k = r.life / r.max;
      const s = r.mesh.scale.x + r.rate * dt;
      r.mesh.scale.set(s, s, s);
      r.mat.opacity = k * k * 0.95;
      if (!r.mesh.userData.flat) r.mesh.quaternion.copy(camera.quaternion);
    }

    for (const f of this.flashes) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        f.mesh.visible = false;
        f.mat.opacity = 0;
        continue;
      }
      const k = f.life / f.max;
      const s = f.mesh.scale.x + f.rate * dt;
      f.mesh.scale.setScalar(s);
      f.mat.opacity = k * k * 0.85;
    }
  }

  reset(): void {
    for (const p of [this.sparks, this.dust]) {
      for (let i = 0; i < p.count; i++) {
        p.life[i] = 0;
        p.alpha[i] = 0;
        p.pos[i * 3 + 1] = -9999;
      }
      p.geo.attributes.position.needsUpdate = true;
      p.geo.attributes.aAlpha.needsUpdate = true;
    }
    for (const r of this.rings) { r.active = false; r.mesh.visible = false; }
    for (const f of this.flashes) { f.active = false; f.mesh.visible = false; }
  }
}

/* ---------------- ribbon trail ---------------- */

export class Trail {
  mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private alpha: Float32Array;
  private n: number;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, segments = 26, color = 0x9fd0ff, width = 0.5) {
    this.n = segments;
    this.pos = new Float32Array(segments * 2 * 3);
    this.alpha = new Float32Array(segments * 2);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));

    const idx: number[] = [];
    for (let i = 0; i < segments - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    scene.add(this.mesh);

    for (let i = 0; i < segments; i++) this.pts.push(new THREE.Vector3());
    this.width = width;
  }

  width: number;

  reset(p: THREE.Vector3): void {
    for (const v of this.pts) v.copy(p);
  }

  update(p: THREE.Vector3, camera: THREE.Camera, strength: number): void {
    // always advance history so the ribbon never snaps across the map when it reappears
    for (let i = this.pts.length - 1; i > 0; i--) this.pts[i].copy(this.pts[i - 1]);
    this.pts[0].copy(p);

    this.mesh.visible = strength > 0.02;
    this.mat.uniforms.uOpacity.value = strength;
    if (strength <= 0.02) return;

    const camPos = camera.position;
    const dir = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const side = new THREE.Vector3();

    for (let i = 0; i < this.n; i++) {
      const cur = this.pts[i];
      const nxt = this.pts[Math.min(this.n - 1, i + 1)];
      dir.subVectors(cur, nxt);
      if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
      dir.normalize();
      toCam.subVectors(camPos, cur).normalize();
      side.crossVectors(dir, toCam).normalize();
      const taper = 1 - i / this.n;
      const w = this.width * taper * (0.4 + strength * 0.9);
      const a = i * 2, b = a + 1;
      this.pos[a * 3] = cur.x + side.x * w;
      this.pos[a * 3 + 1] = cur.y + side.y * w;
      this.pos[a * 3 + 2] = cur.z + side.z * w;
      this.pos[b * 3] = cur.x - side.x * w;
      this.pos[b * 3 + 1] = cur.y - side.y * w;
      this.pos[b * 3 + 2] = cur.z - side.z * w;
      this.alpha[a] = taper * taper;
      this.alpha[b] = taper * taper;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}
