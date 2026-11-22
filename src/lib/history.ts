import { addDays, toISO } from './dates';

export interface FocusSession {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  startedAt: number;
  endedAt: number;
  minutes: number;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  estimate: number;
  done: number;
  finished: boolean;
}

export function dayOf(ts: number): string {
  return toISO(new Date(ts));
}

export function minutesOn(history: FocusSession[], day: string): number {
  return history.filter((s) => dayOf(s.startedAt) === day).reduce((n, s) => n + s.minutes, 0);
}

export function lastNDays(history: FocusSession[], today: string, n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - n + 1);
    return { day, minutes: minutesOn(history, day), sessions: history.filter((s) => dayOf(s.startedAt) === day && s.completed).length };
  });
}

export function streakDays(history: FocusSession[], today: string): number {
  let n = 0;
  let day = minutesOn(history, today) > 0 ? today : addDays(today, -1);
  while (minutesOn(history, day) > 0) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function validateTask(title: string, estimate: string) {
  const errors: { title?: string; estimate?: string } = {};
  if (!title.trim()) errors.title = 'Describe the task.';
  else if (title.trim().length > 80) errors.title = 'Keep it under 80 characters.';
  const e = Number(estimate);
  if (!Number.isInteger(e) || e < 1 || e > 20) errors.estimate = 'Estimate 1 to 20 focus blocks.';
  return errors;
}
