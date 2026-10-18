/**
 * Staff training: paid courses that take an employee off the floor for a
 * few days and raise their skill and morale. Gains shrink towards the top
 * of the scale; advanced courses need experienced staff.
 */

export interface TrainingCourse {
  id: string;
  name: string;
  description: string;
  days: number;
  /** Base price plus a price per skill point the employee already has. */
  baseCost: number;
  costPerSkill: number;
  /** Skill gain at skill 0; scaled by (1 - skill / 120). */
  gain: number;
  morale: number;
  minSkill: number;
}

export const TRAINING_COURSES: Record<string, TrainingCourse> = {
  workshop: { id: 'workshop', name: 'Tageskurs', description: 'Ein Tag Praxisschulung im Haus.', days: 1, baseCost: 250, costPerSkill: 6, gain: 7, morale: 4, minSkill: 0 },
  seminar: { id: 'seminar', name: 'Fachseminar', description: 'Drei Tage externes Seminar mit Zertifikat.', days: 3, baseCost: 900, costPerSkill: 18, gain: 16, morale: 8, minSkill: 25 },
  master: { id: 'master', name: 'Meisterkurs', description: 'Eine Woche Intensivkurs bei den Besten der Stadt.', days: 7, baseCost: 3200, costPerSkill: 40, gain: 28, morale: 12, minSkill: 50 },
};

export const TRAINING_IDS = Object.keys(TRAINING_COURSES);

export function trainingCost(course: TrainingCourse, skill: number): number {
  return Math.round(course.baseCost + course.costPerSkill * skill);
}

export function trainingGain(course: TrainingCourse, skill: number): number {
  return Math.max(1, Math.round(course.gain * (1 - skill / 120) * 10) / 10);
}

/** Daily skill growth by experience: only with morale above 50, faster the happier, slower near the top. */
export function dailySelfImprovement(skill: number, morale: number, hasManager: boolean): number {
  if (morale <= 50) return 0;
  const base = 0.1 + ((morale - 50) / 50) * 0.4; // 0.1 .. 0.5 per day
  return base * (1 - skill / 110) * (hasManager ? 1.2 : 1);
}
