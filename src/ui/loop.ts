/**
 * Real-time game loop: converts wall-clock time into fixed simulation
 * ticks according to the chosen speed, forwards events to the UI and
 * keeps the renderer in sync.
 */

import { session } from './session';
import { useGameStore } from './store/gameStore';
import { daylightFactor, tickToDate } from '../sim/core/clock';
import { audio } from './audio';
import { DISTRICT_ARCHETYPES } from '../sim/data/districts';

/** Game minutes per real second at speed 1. */
export const MINUTES_PER_SECOND = 2;
const MAX_TICKS_PER_FRAME = 240;
const UI_PUBLISH_INTERVAL = 1000 / 12;

let rafId: number | null = null;
let lastTime = 0;
let accumulator = 0;
let lastPublish = 0;
let lastPublishedTick = -1;
let lastAudioUpdate = 0;
let running = false;

/** Street density 0..1 from the hour and how many citizens are on the move. */
function trafficDensity(hour: number, state: { population: { citizens: { activity: string }[] } }): number {
  const curve = hour >= 7 && hour <= 9 ? 1 : hour >= 17 && hour <= 20 ? 0.95 : hour >= 11 && hour <= 14 ? 0.7 : hour >= 21 || hour < 1 ? 0.5 : hour < 6 ? 0.12 : 0.45;
  const citizens = state.population.citizens;
  if (citizens.length === 0) return curve;
  let moving = 0;
  for (const c of citizens) if (c.activity === 'commute' || c.activity === 'eat' || c.activity === 'leisure') moving++;
  return Math.min(1, 0.25 + curve * 0.5 + (moving / citizens.length) * 0.8);
}

export function startLoop(): void {
  if (running) return;
  running = true;
  lastTime = performance.now();
  accumulator = 0;
  rafId = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', onVisibility);
}

export function stopLoop(): void {
  running = false;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  document.removeEventListener('visibilitychange', onVisibility);
}

function onVisibility(): void {
  if (document.hidden) {
    if (!session.online) void useGameStore.getState().autosave();
  } else {
    lastTime = performance.now();
    accumulator = 0;
  }
}

function frame(now: number): void {
  if (!running) return;
  rafId = requestAnimationFrame(frame);
  const sim = session.sim;
  if (!sim) return;
  const dt = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  const speed = sim.state.speed;
  let structural = false;
  let dayEnded = false;
  const online = session.online;
  if (online) {
    // Lockstep: only advance to ticks the server announced, applying its command stream at the right ticks.
    let steps = 0;
    if (online.applyDue(sim)) structural = true;
    while (sim.world.tick < online.serverTick && steps < MAX_TICKS_PER_FRAME) {
      sim.step();
      steps++;
      online.checkHash(sim);
      if (online.applyDue(sim)) structural = true;
    }
  } else if (speed > 0) {
    accumulator += dt * speed * MINUTES_PER_SECOND;
    let ticks = Math.floor(accumulator);
    if (ticks > MAX_TICKS_PER_FRAME) {
      ticks = MAX_TICKS_PER_FRAME;
      accumulator = 0;
    } else {
      accumulator -= ticks;
    }
    if (ticks > 0) sim.run(ticks);
  }
  const events = sim.drainEvents();
  if (events.length > 0) {
    const store = useGameStore.getState();
    for (const e of events) {
      switch (e.type) {
        case 'building:completed':
        case 'building:placed':
        case 'building:removed':
          structural = true;
          break;
        case 'day:ended':
          dayEnded = true;
          break;
        case 'task:completed':
          break;
        case 'log':
          if (e.level === 'success' || e.level === 'danger' || e.level === 'warning') store.notify(e.level, e.message);
          break;
        default:
          break;
      }
    }
  }
  const renderer = session.renderer;
  if (renderer) {
    if (structural) renderer.syncBuildings(sim.state);
    const date = tickToDate(sim.state.tick);
    renderer.setDaylight(daylightFactor(date.minuteOfDay));
    const density = trafficDensity(date.hour, sim.state);
    renderer.setTrafficDensity(density);
    renderer.setWeather(sim.state.weather.kind, sim.state.weather.intensity);
    if (now - lastAudioUpdate > 1000) {
      lastAudioUpdate = now;
      audio.setEnvironment(sim.state.weather.kind, 1 - daylightFactor(date.minuteOfDay), density);
      const corners = renderer.getViewTiles();
      const cx = Math.round(corners.reduce((s, c) => s + c.x, 0) / corners.length);
      const cy = Math.round(corners.reduce((s, c) => s + c.y, 0) / corners.length);
      if (sim.state.grid.inBounds(cx, cy)) audio.setDistrict(DISTRICT_ARCHETYPES[sim.state.districts[sim.state.grid.districtAt(cx, cy)]!.archetype].style);
      if (sim.state.weather.kind === 'storm' && Math.random() < 0.08) audio.thunder();
    }
  }
  if (structural) useGameStore.getState().bumpStructure();
  if (dayEnded && !online) void useGameStore.getState().autosave();
  if (now - lastPublish > UI_PUBLISH_INTERVAL && sim.state.tick !== lastPublishedTick) {
    lastPublish = now;
    lastPublishedTick = sim.state.tick;
    useGameStore.getState().bumpTick();
  }
}
