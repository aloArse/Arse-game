import { useEffect, useRef } from "react";
import type { Engine } from "../game3d/engine";
import { CITY_HALF, CELL, ZONE_R } from "../game3d/city";

/** tactical minimap — top-left, live city/enemy/hero readout */
export default function Minimap({ game, size = 118 }: { game: Engine; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr;
    cv.height = size * dpr;
    let raf = 0;
    let last = 0;
    const k = size / (CITY_HALF * 2);

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 80) return;              // ~12fps is plenty
      last = t;
      const e = game;
      const w = cv.width, h = cv.height;
      g.clearRect(0, 0, w, h);

      // backdrop
      g.fillStyle = "rgba(7,11,26,0.78)";
      g.fillRect(0, 0, w, h);

      const px = (x: number): number => (x + CITY_HALF) * k * dpr;
      const pz = (z: number): number => (z + CITY_HALF) * k * dpr;

      // road grid
      g.strokeStyle = "rgba(120,150,210,0.10)";
      g.lineWidth = dpr;
      for (let r = -CITY_HALF + CELL / 2; r < CITY_HALF; r += CELL) {
        g.beginPath(); g.moveTo(px(r), 0); g.lineTo(px(r), h); g.stroke();
        g.beginPath(); g.moveTo(0, pz(r)); g.lineTo(w, pz(r)); g.stroke();
      }

      // battle zone
      g.strokeStyle = "rgba(255,90,90,0.75)";
      g.lineWidth = 1.6 * dpr;
      g.setLineDash([4 * dpr, 3 * dpr]);
      g.beginPath();
      g.arc(px(0), pz(0), ZONE_R * k * dpr, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "rgba(255,60,60,0.06)";
      g.fill();

      // buildings
      for (const b of e.city.buildings) {
        const bw = Math.max(1.5, b.w * k * dpr);
        if (!b.alive) {
          g.fillStyle = "rgba(110,80,70,0.5)";
          g.fillRect(px(b.x) - bw / 2, pz(b.z) - bw / 2, bw, bw);
        } else {
          const hK = Math.min(1, b.h / 240);
          g.fillStyle = b.hp < b.maxHp * 0.5
            ? `rgba(255,${120 + hK * 60 | 0},60,0.85)`
            : `rgba(${70 + hK * 60 | 0},${100 + hK * 70 | 0},${190 + hK * 40 | 0},0.9)`;
          g.fillRect(px(b.x) - bw / 2, pz(b.z) - bw / 2, bw, bw);
        }
      }

      // traffic
      g.fillStyle = "rgba(220,230,255,0.55)";
      for (const c of e.traffic.cars) {
        const cx = c.axis === 0 ? c.t : c.lane;
        const cz = c.axis === 0 ? c.lane : c.t;
        g.fillRect(px(cx) - dpr, pz(cz) - dpr, 2 * dpr, 2 * dpr);
      }

      // enemies
      for (const en of e.enemies.list) {
        if (en.dead) continue;
        const r = en.kind === "boss" ? 3.4 : en.kind === "mech" ? 2.6 : 1.8;
        g.fillStyle = en.kind === "boss" ? "#ff4757" : en.kind === "mech" ? "#ff8a3c" : "#ff9a6a";
        g.beginPath();
        g.arc(px(en.obj.position.x), pz(en.obj.position.z), r * dpr, 0, Math.PI * 2);
        g.fill();
      }

      // hero arrow
      const hx = px(e.rig.group.position.x);
      const hz = pz(e.rig.group.position.z);
      const yaw = e.rig.group.rotation.y;
      g.save();
      g.translate(hx, hz);
      g.rotate(-yaw + Math.PI);
      g.fillStyle = "#7ae0ff";
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = dpr;
      g.beginPath();
      g.moveTo(0, -5.5 * dpr);
      g.lineTo(3.8 * dpr, 4.2 * dpr);
      g.lineTo(0, 2.2 * dpr);
      g.lineTo(-3.8 * dpr, 4.2 * dpr);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();

      // north marker
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.font = `bold ${8 * dpr}px ui-sans-serif`;
      g.textAlign = "center";
      g.fillText("N", w / 2, 8 * dpr);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [game, size]);

  return (
    <div className="minimap-wrap" style={{ width: size, height: size }}>
      <canvas ref={ref} style={{ width: size, height: size }} />
      <div className="minimap-scan" />
    </div>
  );
}
