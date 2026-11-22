import { describe, expect, it } from 'vitest';
import { advance, DEFAULT_SETTINGS as S, elapsedMs, formatClock, initial, pause, remaining, reset, start, tick, validateSettings } from './timer';
import { lastNDays, minutesOn, streakDays, validateTask, type FocusSession } from './history';

describe('timer state machine', () => {
  it('counts down using absolute time and pauses accurately', () => {
    let t = start(initial(S), 0);
    expect(remaining(t, 60_000)).toBe(24 * 60_000);
    t = pause(t, 60_000);
    expect(t.status).toBe('paused');
    expect(remaining(t, 999_999)).toBe(24 * 60_000); // frozen while paused
    t = start(t, 100_000);
    expect(remaining(t, 160_000)).toBe(23 * 60_000);
    expect(elapsedMs(t, S, 160_000)).toBe(2 * 60_000);
  });
  it('detects completion', () => {
    const t = start(initial(S), 0);
    expect(tick(t, 25 * 60_000 - 1).finished).toBe(false);
    expect(tick(t, 25 * 60_000).finished).toBe(true);
  });
  it('alternates focus and breaks with a long break after N cycles', () => {
    let t = initial({ ...S, cyclesBeforeLong: 2 });
    const s2 = { ...S, cyclesBeforeLong: 2 };
    t = advance(t, s2, 0);
    expect(t.phase).toBe('short');
    t = advance(t, s2, 0);
    expect(t.phase).toBe('focus');
    t = advance(t, s2, 0);
    expect(t.phase).toBe('long');
    expect(t.cycleCount).toBe(0);
    expect(advance(t, s2, 0).phase).toBe('focus');
  });
  it('auto-starts the next phase when enabled and resets', () => {
    const t = advance(initial(S), { ...S, autoStartNext: true }, 1000);
    expect(t.status).toBe('running');
    expect(t.endsAt).toBe(1000 + 5 * 60_000);
    expect(reset(t, S).status).toBe('idle');
  });
  it('formats the clock rounding up partial seconds', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
  });
  it('validates settings', () => {
    const e = validateSettings({ focusMin: '0', shortMin: '5', longMin: 'x', cyclesBeforeLong: '9', autoStartNext: false });
    expect(Object.keys(e).sort()).toEqual(['cyclesBeforeLong', 'focusMin', 'longMin']);
  });
});

describe('history', () => {
  const at = (iso: string, h = 10) => new Date(`${iso}T${String(h).padStart(2, '0')}:00:00`).getTime();
  const sess = (iso: string, minutes: number): FocusSession => ({ id: iso + minutes, taskId: null, taskTitle: null, startedAt: at(iso), endedAt: at(iso) + minutes * 60_000, minutes, completed: true });
  const h = [sess('2026-03-01', 25), sess('2026-03-02', 25), sess('2026-03-02', 10), sess('2026-03-04', 25)];
  it('totals minutes per day', () => {
    expect(minutesOn(h, '2026-03-02')).toBe(35);
    expect(lastNDays(h, '2026-03-04', 4).map((d) => d.minutes)).toEqual([25, 35, 0, 25]);
  });
  it('computes a day streak', () => {
    expect(streakDays(h, '2026-03-04')).toBe(1);
    expect(streakDays(h, '2026-03-03')).toBe(2);
  });
  it('validates tasks', () => {
    expect(validateTask('', '0')).toEqual({ title: expect.any(String), estimate: expect.any(String) });
    expect(validateTask('Write intro', '2')).toEqual({});
  });
});
