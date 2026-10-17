/**
 * Simulation events. Systems publish events; the engine collects them per
 * step so that the UI (or other subsystems) can consume them without the
 * simulation depending on any consumer.
 */

export type LogLevel = 'info' | 'success' | 'warning' | 'danger';

export type SimEvent =
  | { type: 'log'; tick: number; level: LogLevel; message: string; buildingId?: string }
  | { type: 'building:placed'; tick: number; buildingId: string }
  | { type: 'building:completed'; tick: number; buildingId: string }
  | { type: 'building:removed'; tick: number; buildingId: string }
  | { type: 'finance:transaction'; tick: number; amount: number; category: string }
  | { type: 'day:ended'; tick: number; day: number; income: number; expenses: number }
  | { type: 'task:completed'; tick: number; taskId: string };

export type SimEventType = SimEvent['type'];

type Listener<T extends SimEvent = SimEvent> = (event: T) => void;

export class EventBus {
  private listeners = new Map<SimEventType, Set<Listener>>();
  private queue: SimEvent[] = [];

  on<T extends SimEventType>(type: T, listener: Listener<Extract<SimEvent, { type: T }>>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener);
    return () => set!.delete(listener as Listener);
  }

  emit(event: SimEvent): void {
    this.queue.push(event);
    const set = this.listeners.get(event.type);
    if (set) for (const l of set) l(event);
  }

  /** Returns and clears all events queued since the last drain. */
  drain(): SimEvent[] {
    if (this.queue.length === 0) return [];
    const out = this.queue;
    this.queue = [];
    return out;
  }
}
