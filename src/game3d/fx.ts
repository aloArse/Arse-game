// ---------- 3D effects: GPU sparks, dust, shockwave rings, flashes, ribbon trail ----------
// Upgraded: soft-glow sprite particles, rotating debris chunks, lightning arcs,
// a dynamic point-light pool and light pillars. Pairs with the bloom composer.
import * as THREE from "three";

const SPARK_MAX = 2600;
const DUST_MAX = 1400;
const CHUNK_MAX = 360;
const RING_MAX = 26;
const FLASH_MAX = 22;
const BOLT_MAX = 10;
const LIGHT_MAX = 5;

/* soft radial glow sprite (procedural, no assets) */
function makeGlowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.22)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* irregular debris chunk sprite (procedural) */
function makeChunkTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.translate(32, 32);
  g.beginPath();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 12 + Math.random() * 17;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = "#c8c2ba";
  g.fill();
  g.strokeStyle = "rgba(40,36,30,0.85)";
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = "rgba(60,54,46,0.45)";
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  attribute float aRot;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRot;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vRot = aRot;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uChunk;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRot;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (uChunk > 0.5) {
      float s = sin(vRot), co = cos(vRot);
      c = vec2(c.x * co - c.y * s, c.x * s + c.y * co);
    }
    float d = length(c);
    if (d > 0.5) discard;
    vec4 tx = texture2D(uTex, gl_PointCoord);
    float a = uChunk > 0.5 ? tx.a : smoothstep(0.5, 0.06, d) * tx.a;
    gl_FragColor = vec4(vColor * (0.7 + 0.6 * tx.r), a * vAlpha);
  }
`;

interface Pool {
  pts: THREE.Points;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  rot: Float32Array;
  rotV: Float32Array;
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

function makePool(n: number, additive: boolean, tex: THREE.Texture, chunk: boolean): Pool {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  const rot = new Float32Array(n);
  const rotV = new Float32Array(n);
  // park unused particles far away
  for (let i = 0; i < n; i++) pos[i * 3 + 1] = -9999;
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute("aRot", new THREE.BufferAttribute(rot, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uChunk: { value: chunk ? 1 : 0 } },
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
    pts, pos, col, size, alpha, rot, rotV, geo,
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
  size: number, life: number, grav: number, drag: number, grow: number, spin = 0,
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
  p.rot[i] = Math.random() * Math.PI * 2;
  p.rotV[i] = spin * (Math.random() - 0.5) * 2;
}

function poolUpdate(p: Pool, dt: number): void {
  const { pos, vel, life, max, alpha, size, grav, drag, grow, rot, rotV, count } = p;
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
    rot[i] += rotV[i] * dt;
    const k = life[i] / max[i];
    alpha[i] = k > 0.8 ? (1 - k) * 5 : k / 0.8;
  }
  p.geo.attributes.position.needsUpdate = true;
  p.geo.attributes.aColor.needsUpdate = true;
  p.geo.attributes.aSize.needsUpdate = true;
  p.geo.attributes.aAlpha.needsUpdate = true;
  p.geo.attributes.aRot.needsUpdate = true;
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

interface Bolt {
  line: THREE.Line;
  life: number; max: number;
  active: boolean;
}

interface Pillar {
  mesh: THREE.Mesh;
  life: number; max: number;
  active: boolean;
  mat: THREE.MeshBasicMaterial;
}

export class FX {
  group = new THREE.Group();
  private sparks: Pool;
  private dust: Pool;
  private chunks: Pool;
  private rings: Ring[] = [];
  private flashes: Flash[] = [];
  private bolts: Bolt[] = [];
  private pillars: Pillar[] = [];
  private lights: { l: THREE.PointLight; life: number; max: number; base: number }[] = [];
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const glow = makeGlowTexture();
    const chunkTex = makeChunkTexture();
    this.sparks = makePool(SPARK_MAX, true, glow, false);
    this.dust = makePool(DUST_MAX, false, glow, false);
    this.chunks = makePool(CHUNK_MAX, false, chunkTex, true);
    this.group.add(this.sparks.pts, this.dust.pts, this.chunks.pts);

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

    for (let i = 0; i < BOLT_MAX; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.group.add(line);
      this.bolts.push({ line, life: 0, max: 1, active: false });
    }

    const pilGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(pilGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.pillars.push({ mesh, mat, life: 0, max: 1, active: false });
    }

    for (let i = 0; i < LIGHT_MAX; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 46, 1.8);
      l.visible = false;
      this.group.add(l);
      this.lights.push({ l, life: 0, max: 1, base: 0 });
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

  /** tumbling concrete/rebar debris chunks */
  chunk(x: number, y: number, z: number, color: number, n: number, spd: number, size = 1, life = 1.6): void {
    this.c.set(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const v = spd * (0.3 + Math.random() * 0.9);
      const tint = 0.7 + Math.random() * 0.5;
      poolEmit(
        this.chunks, x, y, z,
        Math.cos(a) * s * v, Math.abs(u) * v * 0.8 + spd * 0.25, Math.sin(a) * s * v,
        this.c.r * tint, this.c.g * tint, this.c.b * tint,
        size * (0.6 + Math.random() * 0.9),
        life * (0.6 + Math.random() * 0.8),
        -34, 0.4, 0, 9,
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

  /** double shockwave — outer ring + inner glow ring */
  shock(x: number, y: number, z: number, color: number, maxR: number, dur: number): void {
    this.ring(x, y, z, color, maxR, dur, true, 1.6);
    this.ring(x, y + 0.5, z, 0xffffff, maxR * 0.55, dur * 0.6, true, 2.4);
  }

  /** jagged lightning arc between two points */
  bolt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, dur = 0.18): void {
    const b = this.bolts.find((q) => !q.active);
    if (!b) return;
    b.active = true;
    b.life = dur;
    b.max = dur;
    const attr = b.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    const segs = 8;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const jx = (Math.random() - 0.5) * 3.4 * Math.sin(k * Math.PI);
      const jy = (Math.random() - 0.5) * 3.4 * Math.sin(k * Math.PI);
      const jz = (Math.random() - 0.5) * 3.4 * Math.sin(k * Math.PI);
      attr.setXYZ(i, x0 + (x1 - x0) * k + jx, y0 + (y1 - y0) * k + jy, z0 + (z1 - z0) * k + jz);
    }
    attr.needsUpdate = true;
    (b.line.material as THREE.LineBasicMaterial).color.set(color);
    (b.line.material as THREE.LineBasicMaterial).opacity = 1;
    b.line.visible = true;
  }

  /** vertical light pillar (spawn entrances, judgement beams) */
  pillar(x: number, z: number, groundY: number, topY: number, color: number, radius: number, dur = 1.1): void {
    const p = this.pillars.find((q) => !q.active);
    if (!p) return;
    p.active = true;
    p.life = dur;
    p.max = dur;
    const h = topY - groundY;
    p.mat.color.set(color);
    p.mat.opacity = 0.85;
    p.mesh.visible = true;
    p.mesh.position.set(x, groundY + h / 2, z);
    p.mesh.scale.set(radius, h, radius);
  }

  /** short-lived dynamic light (explosions, beams) — pool of 5, use sparingly */
  light(x: number, y: number, z: number, color: number, intensity: number, dur = 0.4): void {
    let slot = this.lights.find((q) => q.life <= 0);
    if (!slot) slot = this.lights.reduce((a, b) => (a.life < b.life ? a : b));
    slot.life = dur;
    slot.max = dur;
    slot.base = intensity;
    slot.l.color.set(color);
    slot.l.intensity = intensity;
    slot.l.position.set(x, y, z);
    slot.l.visible = true;
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
    poolUpdate(this.chunks, dt);

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

    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        b.line.visible = false;
        continue;
      }
      (b.line.material as THREE.LineBasicMaterial).opacity = b.life / b.max;
    }

    for (const p of this.pillars) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const k = p.life / p.max;
      p.mat.opacity = k * k * 0.85;
      p.mesh.scale.x = p.mesh.scale.z = p.mesh.scale.x * (1 - dt * 0.4);
    }

    for (const s of this.lights) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.l.visible = false;
        s.l.intensity = 0;
        continue;
      }
      const k = s.life / s.max;
      s.l.intensity = s.base * k * k;
    }
  }

  reset(): void {
    for (const p of [this.sparks, this.dust, this.chunks]) {
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
    for (const b of this.bolts) { b.active = false; b.line.visible = false; }
    for (const p of this.pillars) { p.active = false; p.mesh.visible = false; }
    for (const s of this.lights) { s.life = 0; s.l.visible = false; s.l.intensity = 0; }
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
