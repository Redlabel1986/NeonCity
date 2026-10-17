/**
 * Starter tasks: a light guidance layer that reacts to real simulation
 * state. Tasks complete when their condition is met; nothing is scripted.
 */

import type { SimContext } from '../core/context';
import type { GameState, TaskState } from '../state';

export interface TaskDefinition {
  id: string;
  title: string;
  hint: string;
  check: (state: GameState) => boolean;
}

export const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  {
    id: 'first_build',
    title: 'Eröffne deine erste Baustelle',
    hint: 'Öffne das Baumenü (B), wähle eine Ramenbar oder einen Streetfood-Stand und platziere ihn an einer Straße.',
    check: (s) => Object.values(s.buildings).some((b) => b.owner === 'player'),
  },
  {
    id: 'first_open',
    title: 'Erlebe deine erste Eröffnung',
    hint: 'Lass die Zeit laufen, bis die Baustelle fertig ist. Die Bauzeit hängt vom Gebäude und der Energieversorgung ab.',
    check: (s) => Object.values(s.buildings).some((b) => b.owner === 'player' && b.status === 'operational'),
  },
  {
    id: 'first_guests',
    title: 'Bediene deine ersten 100 Gäste',
    hint: 'Gäste kommen zu den Öffnungszeiten. Bezirk, Preis und Ruf bestimmen, wie viele.',
    check: (s) => Object.values(s.buildings).reduce((n, b) => n + (b.business && 'lifetimeGuests' in b.business ? b.business.lifetimeGuests : 0), 0) >= 100,
  },
  {
    id: 'profit_day',
    title: 'Schließe einen Tag mit Gewinn ab',
    hint: 'Einnahmen müssen Miete, Löhne, Zutaten und Betriebskosten übersteigen. Prüfe die Finanzen (F).',
    check: (s) => s.ledger.balanceHistory.length > 1 && s.ledger.yesterdayIncome > s.ledger.yesterdayExpenses,
  },
  {
    id: 'second_business',
    title: 'Betreibe zwei Standorte gleichzeitig',
    hint: 'Ein zweiter Standort in einem anderen Bezirk erreicht andere Kundschaft.',
    check: (s) => Object.values(s.buildings).filter((b) => b.owner === 'player' && b.status === 'operational').length >= 2,
  },
  {
    id: 'order_supplies',
    title: 'Bestelle Zutaten nach',
    hint: 'Im Dashboard unter Einkauf. Lieferanten unterscheiden sich in Preis, Qualität und Lieferzeit.',
    check: (s) =>
      Object.values(s.buildings).some(
        (b) => b.business && (b.business.kind === 'gastronomy' || b.business.kind === 'retail') && (b.business.orders.length > 0 || b.business.history.some((h) => (h.purchases ?? 0) > 0)),
      ),
  },
  {
    id: 'hire_staff',
    title: 'Stelle einen Mitarbeiter ein',
    hint: 'Bewerber warten im Dashboard unter Personal. Ein zweiter Koch erhöht die Kapazität.',
    check: (s) => Object.values(s.buildings).some((b) => b.business?.employees.some((e) => e.hiredTick > b.placedTick)),
  },
  {
    id: 'first_upgrade',
    title: 'Baue deinen Betrieb aus',
    hint: 'Gastraum, Küche oder Leuchtreklame im Dashboard unter Ausbau.',
    check: (s) => Object.values(s.buildings).some((b) => b.business && Object.values(b.business.upgrades).some((l) => l >= 1)),
  },
  {
    id: 'four_stars',
    title: 'Erreiche vier Sterne',
    hint: 'Bewertungen hängen von Gerichtsqualität, Preis, Hygiene, Service und Ausstattung ab.',
    check: (s) => Object.values(s.buildings).some((b) => b.business && 'reviewCount' in b.business && b.business.reviewCount >= 30 && b.business.rating >= 4),
  },
  {
    id: 'second_industry',
    title: 'Steig in eine zweite Branche ein',
    hint: 'Kapselhotel, Taxidepot oder Nachtkiosk: jede Branche hat ihre eigene Logik.',
    check: (s) => new Set(Object.values(s.buildings).filter((b) => b.owner === 'player' && b.business).map((b) => b.business!.kind)).size >= 2,
  },
  {
    id: 'landlord',
    title: 'Werde Vermieter',
    hint: 'Kaufe ein Wohngebäude im Immobilien-Panel und kassiere Miete von den Bewohnern.',
    check: (s) => Object.values(s.buildings).some((b) => b.owner === 'player' && b.property),
  },
  {
    id: 'reserve',
    title: 'Baue eine Reserve von 30.000 ¢ auf',
    hint: 'Kapital ist in Phase 2 die Grundlage für Lieferverträge und Erweiterungen.',
    check: (s) => s.player.difficulty !== 'sandbox' && s.ledger.balance >= 30000,
  },
];

export function createTaskStates(): TaskState[] {
  return TASK_DEFINITIONS.map((t) => ({ id: t.id, completedTick: null }));
}

export function stepTasks(ctx: SimContext): void {
  const { state, events } = ctx;
  for (const task of state.tasks) {
    if (task.completedTick !== null) continue;
    const def = TASK_DEFINITIONS.find((t) => t.id === task.id);
    if (!def) continue;
    if (def.check(state)) {
      task.completedTick = state.tick;
      events.emit({ type: 'task:completed', tick: state.tick, taskId: task.id });
      events.emit({ type: 'log', tick: state.tick, level: 'success', message: `Aufgabe erledigt: ${def.title}` });
    }
  }
}
