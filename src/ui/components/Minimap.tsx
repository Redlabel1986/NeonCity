import { useEffect, useRef } from 'react';
import { session, cameraListeners } from '../session';
import { useGameStore } from '../store/gameStore';
import { TileKind } from '../../sim/world/grid';
import { DISTRICT_ARCHETYPES, type DistrictStats } from '../../sim/data/districts';
import { useState } from 'react';

const WIDTH = 240;

type Heat = 'none' | keyof DistrictStats | 'control';
const HEATMAPS: { id: Heat; label: string }[] = [
  { id: 'none', label: 'Bezirke' },
  { id: 'crime', label: 'Kriminalität' },
  { id: 'policePresence', label: 'Polizei' },
  { id: 'purchasingPower', label: 'Kaufkraft' },
  { id: 'attractiveness', label: 'Attraktivität' },
  { id: 'rentIndex', label: 'Mieten' },
  { id: 'pollution', label: 'Verschmutzung' },
  { id: 'demandFood', label: 'Nachfrage' },
  { id: 'control', label: 'Gebietskontrolle' },
];

function heatColor(value: number): string {
  const t = Math.max(0, Math.min(1, value));
  const r = Math.round(40 + 215 * t);
  const g = Math.round(60 + 120 * (1 - Math.abs(t - 0.5) * 2));
  const b = Math.round(200 * (1 - t) + 30);
  return `rgb(${r},${g},${b})`;
}

/** Isometric overview map drawn with Canvas 2D; click to move the camera. */
/** The square of tiles the minimap shows: the shown map's rectangle (or the whole city). */
function mapView(width: number, height: number): { x0: number; y0: number; n: number } {
  const r = session.renderer?.mapRect;
  if (!r) return { x0: 0, y0: 0, n: Math.max(width, height) };
  return { x0: r.x0, y0: r.y0, n: Math.max(r.x1 - r.x0 + 1, r.y1 - r.y0 + 1) };
}

export function Minimap() {
  const activeMap = useGameStore((s) => s.activeMap);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const structureVersion = useGameStore((s) => s.structureVersion);
  const tick = useGameStore((s) => s.tick);
  const [heat, setHeat] = useState<Heat>('none');
  const heatTick = heat === 'none' ? 0 : Math.floor(tick / 50);

  useEffect(() => {
    const sim = session.sim;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const { grid, districts, buildings, playerId } = sim.state;
    const heatValue = (districtId: number): number | null => {
      if (heat === 'none') return null;
      const d = districts[districtId]!;
      if (heat === 'control') {
        const org = sim.state.underworld.org;
        const rival = sim.state.underworld.rivals.reduce((s, f) => s + (f.control[districtId] ?? 0), 0);
        return Math.min(1, ((org?.control[districtId] ?? 0) + rival) / 100);
      }
      const v = d.stats[heat];
      return heat === 'rentIndex' ? Math.min(1, v / 60) : v / 100;
    };
    const view = mapView(grid.width, grid.height);
    const n = view.n;
    const s = WIDTH / (2 * n);
    canvas.width = WIDTH;
    canvas.height = Math.ceil(n * s) + 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let gy = view.y0; gy < view.y0 + n && gy < grid.height; gy++) {
      for (let gx = view.x0; gx < view.x0 + n && gx < grid.width; gx++) {
        if (!(session.renderer?.isTileShown(gx, gy) ?? true)) continue;
        const x = gx - view.x0;
        const y = gy - view.y0;
        const i = grid.index(gx, gy);
        const kind = grid.kind[i]!;
        let color = '#15131c';
        const hv = heatValue(grid.district[i]!);
        if (hv !== null && kind !== TileKind.Water) {
          ctx.fillStyle = kind === TileKind.Road ? '#1a1a22' : heatColor(hv);
          const mx = (x - y) * s + WIDTH / 2;
          const my = ((x + y) * s) / 2;
          ctx.fillRect(mx - s, my, s * 2, s);
          continue;
        }
        if (kind === TileKind.Road) color = '#2b2a36';
        else if (kind === TileKind.Water) color = '#0a1a33';
        else if (kind === TileKind.Park) color = '#143a28';
        else if (kind === TileKind.Building) {
          const b = buildings[grid.occupant[i]!];
          if (b?.owner === playerId) color = '#ff2bd6';
          else if (b && b.owner !== 'city') color = '#ffb020';
          else {
            const arch = DISTRICT_ARCHETYPES[districts[grid.district[i]!]!.archetype];
            const c = arch.color;
            const r = (c >> 16) & 255;
            const g = (c >> 8) & 255;
            const bl = c & 255;
            color = `rgb(${Math.round(r * 0.35 + 20)},${Math.round(g * 0.35 + 18)},${Math.round(bl * 0.35 + 28)})`;
          }
        } else if (kind === TileKind.Lot) color = '#3a2a5a';
        ctx.fillStyle = color;
        const mx = (x - y) * s + WIDTH / 2;
        const my = ((x + y) * s) / 2;
        ctx.fillRect(mx - s, my, s * 2, s);
      }
    }
  }, [structureVersion, heat, heatTick, activeMap]);

  useEffect(() => {
    const draw = (): void => {
      const sim = session.sim;
      const renderer = session.renderer;
      const canvas = overlayRef.current;
      if (!sim || !renderer || !canvas) return;
      const view = mapView(sim.state.grid.width, sim.state.grid.height);
      const n = view.n;
      const s = WIDTH / (2 * n);
      canvas.width = WIDTH;
      canvas.height = Math.ceil(n * s) + 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const corners = renderer.getViewTiles();
      ctx.beginPath();
      corners.forEach((c, i) => {
        const mx = (c.x - view.x0 - (c.y - view.y0)) * s + WIDTH / 2;
        const my = ((c.x - view.x0 + c.y - view.y0) * s) / 2;
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(25,230,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(25,230,255,0.08)';
      ctx.fill();
    };
    draw();
    cameraListeners.add(draw);
    return () => {
      cameraListeners.delete(draw);
    };
  }, [structureVersion, activeMap]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const sim = session.sim;
    const renderer = session.renderer;
    const canvas = overlayRef.current;
    if (!sim || !renderer || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const mx = (e.clientX - rect.left) * scale - WIDTH / 2;
    const my = (e.clientY - rect.top) * scale;
    const view = mapView(sim.state.grid.width, sim.state.grid.height);
    const s = WIDTH / (2 * view.n);
    const x = (mx / s + (2 * my) / s) / 2 + view.x0;
    const y = ((2 * my) / s - mx / s) / 2 + view.y0;
    renderer.focusTile(Math.round(x), Math.round(y));
  };

  return (
    <div className="panel pointer-events-auto m-2 shrink-0 p-1" aria-label="Übersichtskarte">
      <select className="input mb-1 w-full px-1 py-0 text-xs" value={heat} onChange={(e) => setHeat(e.target.value as Heat)} aria-label="Heatmap">
        {HEATMAPS.map((h) => (
          <option key={h.id} value={h.id}>
            {h.label}
          </option>
        ))}
      </select>
      <div className="relative" style={{ width: WIDTH }}>
        <canvas ref={canvasRef} className="block w-full" aria-hidden />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full cursor-crosshair"
          role="button"
          tabIndex={0}
          aria-label="Kamera auf Kartenposition bewegen"
          onClick={onClick}
        />
      </div>
    </div>
  );
}
