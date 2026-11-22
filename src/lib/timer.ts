export type Phase = 'focus' | 'short' | 'long';
export type Status = 'idle' | 'running' | 'paused';

export interface Settings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  cyclesBeforeLong: number;
  autoStartNext: boolean;
}

export const DEFAULT_SETTINGS: Settings = { focusMin: 25, shortMin: 5, longMin: 15, cyclesBeforeLong: 4, autoStartNext: false };

export interface TimerState {
  phase: Phase;
  status: Status;
  /** Remaining time when paused/idle. */
  remainingMs: number;
  /** Absolute end time while running (keeps time accurate in background tabs). */
  endsAt: number | null;
  /** When the current focus block was first started. */
  startedAt: number | null;
  /** Focus blocks completed since the last long break. */
  cycleCount: number;
}

export const PHASE_LABEL: Record<Phase, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };

export function phaseMs(phase: Phase, s: Settings): number {
  const min = phase === 'focus' ? s.focusMin : phase === 'short' ? s.shortMin : s.longMin;
  return min * 60_000;
}

export function initial(s: Settings): TimerState {
  return { phase: 'focus', status: 'idle', remainingMs: phaseMs('focus', s), endsAt: null, startedAt: null, cycleCount: 0 };
}

export function start(t: TimerState, now: number): TimerState {
  if (t.status === 'running') return t;
  return { ...t, status: 'running', endsAt: now + t.remainingMs, startedAt: t.startedAt ?? now };
}

export function pause(t: TimerState, now: number): TimerState {
  if (t.status !== 'running' || t.endsAt == null) return t;
  return { ...t, status: 'paused', remainingMs: Math.max(0, t.endsAt - now), endsAt: null };
}

export function remaining(t: TimerState, now: number): number {
  return t.status === 'running' && t.endsAt != null ? Math.max(0, t.endsAt - now) : t.remainingMs;
}

/** Elapsed whole minutes in the current block (used when finishing focus early). */
export function elapsedMs(t: TimerState, s: Settings, now: number): number {
  return phaseMs(t.phase, s) - remaining(t, now);
}

export function nextPhase(t: TimerState, s: Settings): { phase: Phase; cycleCount: number } {
  if (t.phase === 'focus') {
    const count = t.cycleCount + 1;
    return count >= s.cyclesBeforeLong ? { phase: 'long', cycleCount: 0 } : { phase: 'short', cycleCount: count };
  }
  return { phase: 'focus', cycleCount: t.cycleCount };
}

/** Moves to the next phase. Auto-starts it when the setting is on. */
export function advance(t: TimerState, s: Settings, now: number, autoStart = s.autoStartNext): TimerState {
  const n = nextPhase(t, s);
  const base: TimerState = { phase: n.phase, cycleCount: n.cycleCount, status: 'idle', remainingMs: phaseMs(n.phase, s), endsAt: null, startedAt: null };
  return autoStart ? start(base, now) : base;
}

/** Checks whether the running block has finished. */
export function tick(t: TimerState, now: number): { finished: boolean } {
  return { finished: t.status === 'running' && t.endsAt != null && now >= t.endsAt };
}

export function reset(t: TimerState, s: Settings): TimerState {
  return { ...t, status: 'idle', remainingMs: phaseMs(t.phase, s), endsAt: null, startedAt: null };
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function validateSettings(input: Record<keyof Settings, string | boolean>) {
  const errors: Partial<Record<keyof Settings, string>> = {};
  const check = (k: keyof Settings, min: number, max: number, label: string) => {
    const v = Number(input[k]);
    if (input[k] === '' || !Number.isInteger(v) || v < min || v > max) errors[k] = `${label} must be a whole number from ${min} to ${max}.`;
  };
  check('focusMin', 1, 120, 'Focus length');
  check('shortMin', 1, 30, 'Short break');
  check('longMin', 1, 60, 'Long break');
  check('cyclesBeforeLong', 2, 8, 'Focus blocks before a long break');
  return errors;
}
