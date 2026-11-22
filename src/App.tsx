import { useEffect, useRef, useState } from 'react';
import { DemoTag, EmptyState, Field, Landing, NotFound, Notice, Shell, uid, useFlash, usePersistentState, useRoute } from './shared/ui';
import { formatDay, toISO } from './lib/dates';
import { dayOf, lastNDays, minutesOn, streakDays, validateTask, type FocusSession, type Task } from './lib/history';
import {
  advance,
  DEFAULT_SETTINGS,
  elapsedMs,
  formatClock,
  initial,
  pause,
  PHASE_LABEL,
  phaseMs,
  remaining,
  reset,
  start,
  tick,
  validateSettings,
  type Settings,
  type TimerState,
} from './lib/timer';

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/timer', label: 'Timer' },
  { to: '/history', label: 'History' },
  { to: '/settings', label: 'Settings' },
];

function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch {
    /* audio unavailable — the on-screen message is enough */
  }
}

function demoHistory(): FocusSession[] {
  const out: FocusSession[] = [];
  const titles = ['Demo: Revise lecture notes', 'Demo: Write cover letter', null];
  const counts = [2, 3, 0, 4, 1, 3, 2];
  for (let i = 6; i >= 0; i--) {
    const count = counts[6 - i];
    for (let k = 0; k < count; k++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(9 + k, 0, 0, 0);
      if (i === 0 && d.getTime() > Date.now()) d.setTime(Date.now() - (count - k) * 35 * 60_000);
      const early = k === 1 && i % 3 === 0;
      out.push({ id: `demo-${i}-${k}`, taskId: null, taskTitle: titles[k % 3], startedAt: d.getTime(), endedAt: d.getTime() + 25 * 60_000, minutes: early ? 12 : 25, completed: !early });
    }
  }
  return out.reverse();
}

const DEMO_TASKS: Task[] = [
  { id: 'demo-t1', title: 'Demo: Revise lecture notes', estimate: 4, done: 3, finished: false },
  { id: 'demo-t2', title: 'Demo: Write cover letter for the summer research placement application', estimate: 2, done: 0, finished: false },
  { id: 'demo-t3', title: 'Demo: Tidy reference list', estimate: 1, done: 1, finished: true },
];

export default function App() {
  const [route] = useRoute();
  const [settings, setSettings] = usePersistentState<Settings>('focus-room:settings', DEFAULT_SETTINGS);
  const [timer, setTimer] = usePersistentState<TimerState>('focus-room:timer', () => initial(DEFAULT_SETTINGS));
  const [tasks, setTasks] = usePersistentState<Task[]>('focus-room:tasks', DEMO_TASKS);
  const [history, setHistory] = usePersistentState<FocusSession[]>('focus-room:history', demoHistory);
  const [activeTask, setActiveTask] = usePersistentState<string>('focus-room:active-task', 'demo-t1');
  const [sound, setSound] = usePersistentState('focus-room:sound', true);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useFlash(6000);

  const timerRef = useRef(timer);
  timerRef.current = timer;

  function logFocus(t: TimerState, endedAt: number, minutes: number, completed: boolean) {
    const task = tasks.find((x) => x.id === activeTask) ?? null;
    setHistory((h) => [
      { id: uid('s'), taskId: task?.id ?? null, taskTitle: task?.title ?? null, startedAt: t.startedAt ?? endedAt - minutes * 60_000, endedAt, minutes, completed },
      ...h,
    ]);
    if (task && completed) setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, done: x.done + 1 } : x)));
  }

  // Clock: re-render frequently while running and handle phase completion.
  useEffect(() => {
    if (timer.status !== 'running') return;
    const id = setInterval(() => {
      const t = timerRef.current;
      const n = Date.now();
      setNow(n);
      if (tick(t, n).finished) {
        if (t.phase === 'focus') {
          logFocus(t, n, settings.focusMin, true);
          setFlash({ kind: 'success', text: `Focus block complete — ${settings.focusMin} minutes logged. Time for a break.` });
        } else {
          setFlash({ kind: 'info', text: 'Break over. Ready for the next focus block?' });
        }
        if (sound) chime();
        const next = advance(t, settings, n);
        timerRef.current = next; // guard: later ticks before re-render must not log this block again
        setTimer(next);
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.status, timer.endsAt, settings, sound, activeTask, tasks]);

  const left = remaining(timer, now);
  useEffect(() => {
    document.title = timer.status === 'running' ? `${formatClock(left)} · ${PHASE_LABEL[timer.phase]} — Focus Room` : 'Focus Room';
  }, [left, timer.status, timer.phase]);

  const controls = {
    toggle: () => {
      const n = Date.now();
      setNow(n);
      setTimer(timer.status === 'running' ? pause(timer, n) : start(timer, n));
    },
    reset: () => setTimer(reset(timer, settings)),
    skip: () => setTimer(advance(timer, settings, Date.now(), false)),
    finishEarly: () => {
      const n = Date.now();
      const mins = Math.floor(elapsedMs(timer, settings, n) / 60_000);
      if (mins < 1) {
        setFlash({ kind: 'error', text: 'Less than a minute of focus so far — nothing to log yet. Use Reset to start over.' });
        return;
      }
      logFocus(timer, n, mins, false);
      setFlash({ kind: 'success', text: `Logged ${mins} minute${mins === 1 ? '' : 's'} of focus (ended early).` });
      setTimer(advance(timer, settings, n, false));
    },
  };

  let page;
  if (route === '/') page = <Home />;
  else if (route === '/timer')
    page = (
      <TimerPage
        timer={timer}
        left={left}
        settings={settings}
        controls={controls}
        tasks={tasks}
        setTasks={setTasks}
        activeTask={activeTask}
        setActiveTask={setActiveTask}
        history={history}
        flash={flash}
        clearFlash={() => setFlash(null)}
      />
    );
  else if (route === '/history') page = <History history={history} setHistory={setHistory} />;
  else if (route === '/settings')
    page = (
      <SettingsPage
        settings={settings}
        sound={sound}
        setSound={setSound}
        onSave={(s) => {
          setSettings(s);
          if (timer.status === 'idle') setTimer({ ...timer, remainingMs: phaseMs(timer.phase, s) });
        }}
      />
    );
  else page = <NotFound />;

  return (
    <Shell name="Focus Room" wordmark={['Focus', 'Room']} nav={NAV} route={route} cta={{ to: '/timer', label: 'Start focusing' }}>
      {page}
    </Shell>
  );
}

function Ring({ pct, size = 280, children, active }: { pct: number; size?: number; children: React.ReactNode; active?: boolean }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <div className={`ring ${active ? 'is-active' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  );
}

function HeroTimer() {
  // A real countdown using the same timer logic as the app, started mid-block for the preview.
  const [t] = useState(() => start({ ...initial(DEFAULT_SETTINGS), remainingMs: 18 * 60_000 + 42_000 }, Date.now()));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = remaining(t, now);
  const pct = ((25 * 60_000 - left) / (25 * 60_000)) * 100;
  return (
    <div className="hero-timer">
      <Ring pct={pct} size={230} active>
        <span className="label-mono">Focus · 2 of 4</span>
        <span className="ring-clock">{formatClock(left)}</span>
      </Ring>
      <div className="ht-side">
        <div>
          <span className="label-mono">Working on</span>
          <p className="ht-task">Revise lecture notes</p>
          <div className="progress"><span style={{ width: '75%' }} /></div>
          <p className="hint">3 of 4 focus blocks done</p>
        </div>
        <div className="ht-week" aria-label="Focus minutes, last 7 days (demo)">
          {[50, 75, 0, 100, 25, 75, 50].map((m, i) => (
            <span key={i} style={{ height: `${Math.max(m, 4)}%`, ['--i' as string]: i }} className="grow-in" />
          ))}
        </div>
        <p className="hint">Focus minutes · last 7 days</p>
      </div>
    </div>
  );
}

function Home() {
  return (
    <Landing
      eyebrow="Focus timer · Pomodoro method"
      title={<>One task. One block. <em>Then rest.</em></>}
      lead="A calm focus timer with configurable focus and break lengths. Choose a task before you start; every completed block is logged against it, and your daily totals build up in History."
      primary={{ href: '#/timer', label: 'Start focusing' }}
      secondary={{ href: '#/history', label: 'View history' }}
      previewLabel="Focus block in progress"
      preview={<HeroTimer />}
      steps={[
        { title: 'Pick a task', body: 'Write what you will work on and estimate how many focus blocks it needs.' },
        { title: 'Focus, then break', body: 'Work until the chime, take the break. A long break follows every few blocks.' },
        { title: 'Review your day', body: 'History shows daily focus totals and every session you logged.' },
      ]}
      stepsIntro="The timer keeps accurate time even when the tab is hidden, and survives a page reload mid-block."
      features={[
        { title: 'Configurable cycle', body: 'Focus, short break and long break lengths, and blocks before a long break.' },
        { title: 'Obvious active state', body: 'A progress ring, the page title and a calm running indicator show a block is underway.' },
        { title: 'Task progress', body: 'Each task shows completed vs estimated focus blocks.' },
        { title: 'Daily totals', body: 'A seven-day chart of focused minutes and a table of sessions.' },
      ]}
      note="Keyboard: press Space on the Timer page to start or pause. Browsers may block the chime until you have interacted with the page."
      closing={{ title: <>Start a <em>25-minute block.</em></>, action: { href: '#/timer', label: 'Open the timer' } }}
    />
  );
}

function TimerPage(props: {
  timer: TimerState;
  left: number;
  settings: Settings;
  controls: { toggle: () => void; reset: () => void; skip: () => void; finishEarly: () => void };
  tasks: Task[];
  setTasks: (fn: (t: Task[]) => Task[]) => void;
  activeTask: string;
  setActiveTask: (id: string) => void;
  history: FocusSession[];
  flash: { kind: 'success' | 'error' | 'info' | 'warn'; text: string } | null;
  clearFlash: () => void;
}) {
  const { timer, left, settings, controls, tasks, setTasks, activeTask, setActiveTask, history } = props;
  const today = toISO(new Date());
  const total = phaseMs(timer.phase, settings);
  const pct = Math.min(100, ((total - left) / total) * 100);
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState('2');
  const [errors, setErrors] = useState<ReturnType<typeof validateTask>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag)) {
        e.preventDefault();
        controls.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function addTask(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateTask(title, estimate);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const t: Task = { id: uid('t'), title: title.trim(), estimate: Number(estimate), done: 0, finished: false };
    setTasks((ts) => [...ts, t]);
    setActiveTask(t.id);
    setTitle('');
  }
  const open = tasks.filter((t) => !t.finished);
  const current = tasks.find((t) => t.id === activeTask);
  const block = timer.phase === 'focus' ? timer.cycleCount + 1 : timer.cycleCount;

  return (
    <>
    <div className="page-head">
      <div>
        <p className="eyebrow">Workspace · Timer</p>
        <h1>{timer.status === 'running' ? <>In <em>focus</em></> : <>Ready to <em>focus</em></>}</h1>
        <p>{timer.status === 'running' ? 'Notifications off, phone away. You’ve got this block.' : 'Pick a task, then start the block. Space starts and pauses.'}</p>
      </div>
    </div>
    <div className="timer-layout">
      <section className={`card timer-card phase-${timer.phase} status-${timer.status}`} aria-label="Timer">
        <div className="row row-between">
          <span className="badge badge-accent">{PHASE_LABEL[timer.phase]}{timer.phase === 'focus' ? ` · block ${block} of ${settings.cyclesBeforeLong}` : ''}</span>
          <span className="small muted">{timer.status === 'paused' ? 'Paused' : timer.status === 'running' ? 'Running' : 'Ready'}</span>
        </div>
        <div className="clock-wrap">
          <Ring pct={pct} size={300} active={timer.status === 'running'}>
            <span className="label-mono">{timer.status === 'running' ? 'In session' : timer.status === 'paused' ? 'Paused' : 'Ready'}</span>
            <div className="clock" role="timer" aria-live="off" data-testid="clock">{formatClock(left)}</div>
            <span className="hint">of {settings[timer.phase === 'focus' ? 'focusMin' : timer.phase === 'short' ? 'shortMin' : 'longMin']} min</span>
          </Ring>
        </div>
        <p className="muted small current-task">
          {timer.phase === 'focus' ? (current ? <>Working on: <strong>{current.title}</strong></> : 'No task selected — the session will be logged without one.') : 'Step away from the screen for a moment.'}
        </p>
        <div className="row timer-controls">
          <button type="button" className="btn btn-primary btn-lg" onClick={controls.toggle}>
            {timer.status === 'running' ? 'Pause' : timer.status === 'paused' ? 'Resume' : `Start ${PHASE_LABEL[timer.phase].toLowerCase()}`}
          </button>
          <button type="button" className="btn" onClick={controls.reset} disabled={timer.status === 'idle'}>Reset</button>
          {timer.phase === 'focus' ? (
            <button type="button" className="btn" onClick={controls.finishEarly} disabled={timer.status === 'idle'}>Finish early</button>
          ) : (
            <button type="button" className="btn" onClick={controls.skip}>Skip break</button>
          )}
        </div>
        {props.flash && <Notice kind={props.flash.kind} onDismiss={props.clearFlash}>{props.flash.text}</Notice>}
      </section>

      <div className="stack">
        <div className="stats">
          <div className="stat"><div className="stat-label">Focused today</div><div className="stat-value" data-testid="today-total">{minutesOn(history, today)} min</div></div>
          <div className="stat"><div className="stat-label">Blocks today</div><div className="stat-value">{history.filter((s) => s.completed && dayOf(s.startedAt) === today).length}</div></div>
          <div className="stat"><div className="stat-label">Day streak</div><div className="stat-value">{streakDays(history, today)}</div></div>
        </div>
        <section className="card stack" aria-labelledby="tasks-title">
          <h2 id="tasks-title">Tasks</h2>
          <form onSubmit={addTask} className="task-form" noValidate>
            <Field label="New task" error={errors.title}>{(c) => <input type="text" {...c} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Outline chapter 3" />}</Field>
            <Field label="Blocks" error={errors.estimate}>{(c) => <input type="number" min={1} max={20} {...c} value={estimate} onChange={(e) => setEstimate(e.target.value)} />}</Field>
            <button type="submit" className="btn">Add</button>
          </form>
          {open.length === 0 ? (
            <p className="muted">No open tasks. Add one so your focus time is logged against it.</p>
          ) : (
            <ul className="list" aria-label="Open tasks">
              {open.map((t) => (
                <li key={t.id} className={`task ${t.id === activeTask ? 'is-active' : ''}`}>
                  <label className="check">
                    <input type="radio" name="active-task" checked={t.id === activeTask} onChange={() => setActiveTask(t.id)} />
                    <span>{t.title.replace('Demo: ', '')} {t.id.startsWith('demo') && <DemoTag />}</span>
                  </label>
                  <span className={`badge ${t.done >= t.estimate ? 'badge-ok' : ''}`}>{t.done}/{t.estimate} blocks</span>
                  <button type="button" className="btn btn-sm" onClick={() => setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, finished: true } : x)))} aria-label={`Mark ${t.title} finished`}>Done</button>
                </li>
              ))}
            </ul>
          )}
          {activeTask && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActiveTask('')}>Focus without a task</button>}
          {tasks.some((t) => t.finished) && (
            <details>
              <summary className="small">Finished tasks ({tasks.filter((t) => t.finished).length})</summary>
              <ul className="list small">
                {tasks.filter((t) => t.finished).map((t) => <li key={t.id}>✓ {t.title} — {t.done} blocks</li>)}
              </ul>
            </details>
          )}
        </section>
      </div>
    </div>
    </>
  );
}

function History({ history, setHistory }: { history: FocusSession[]; setHistory: (h: FocusSession[]) => void }) {
  const today = toISO(new Date());
  const days = lastNDays(history, today, 7);
  const max = Math.max(60, ...days.map((d) => d.minutes));
  const weekTotal = days.reduce((n, d) => n + d.minutes, 0);
  const loadDemo = () => {
    const out: FocusSession[] = [];
    const titles = ['Demo: Revise lecture notes', 'Demo: Write cover letter', null];
    for (let i = 6; i >= 0; i--) {
      const count = [2, 3, 0, 4, 1, 3, 2][6 - i];
      for (let k = 0; k < count; k++) {
        const d = new Date();
        d.setDate(d.getDate() - i - (i === 0 ? 0 : 0));
        d.setHours(9 + k, 0, 0, 0);
        if (i === 0 && d.getTime() > Date.now()) d.setTime(Date.now() - (count - k) * 30 * 60_000);
        out.push({ id: uid('demo'), taskId: null, taskTitle: titles[k % 3], startedAt: d.getTime(), endedAt: d.getTime() + 25 * 60_000, minutes: 25, completed: true });
      }
    }
    setHistory([...out.reverse(), ...history]);
  };
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="eyebrow">Workspace · History</p>
          <h1>Focus <em>history</em></h1>
          <p>{weekTotal} minutes of focus in the last 7 days.</p>
        </div>
        <div className="row">
          {history.length === 0 && <button type="button" className="btn" onClick={loadDemo}>Load demo history</button>}
          {history.some((h) => h.id.startsWith('demo')) && <button type="button" className="btn" onClick={() => setHistory(history.filter((h) => !h.id.startsWith('demo')))}>Clear demo sessions</button>}
          {history.length > 0 && (
            <button type="button" className="btn btn-danger" onClick={() => window.confirm('Delete all logged sessions?') && setHistory([])}>Clear history</button>
          )}
        </div>
      </div>
      {history.length === 0 ? (
        <EmptyState title="No focus sessions yet" actions={<a className="btn btn-primary" href="#/timer">Go to the timer</a>}>
          Completed focus blocks and early finishes are logged here automatically.
        </EmptyState>
      ) : (
        <>
          <div className="card">
            <h2>Daily focus totals</h2>
            <div className="day-bars" role="img" aria-label={`Focus minutes per day: ${days.map((d) => `${formatDay(d.day, { weekday: 'short' })} ${d.minutes}`).join(', ')}`}>
              {days.map((d) => (
                <div key={d.day} className="day-bar">
                  <span className="small">{d.minutes}</span>
                  <div className="day-bar-track"><div style={{ height: `${(d.minutes / max) * 100}%` }} /></div>
                  <span className="small muted">{formatDay(d.day, { weekday: 'short' })}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Sessions</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Time</th><th>Task</th><th className="num">Minutes</th><th>Result</th></tr></thead>
                <tbody>
                  {history.slice(0, 50).map((s) => (
                    <tr key={s.id}>
                      <td>{formatDay(dayOf(s.startedAt))}</td>
                      <td>{new Date(s.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{s.taskTitle ? s.taskTitle.replace('Demo: ', '') : <span className="muted">No task</span>} {s.id.startsWith('demo') && <DemoTag />}</td>
                      <td className="num">{s.minutes}</td>
                      <td><span className={`badge ${s.completed ? 'badge-ok' : 'badge-warn'}`}>{s.completed ? 'Completed' : 'Ended early'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {history.length > 50 && <p className="hint">Showing the 50 most recent sessions.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function SettingsPage({ settings, onSave, sound, setSound }: { settings: Settings; onSave: (s: Settings) => void; sound: boolean; setSound: (b: boolean) => void }) {
  const [form, setForm] = useState({
    focusMin: String(settings.focusMin),
    shortMin: String(settings.shortMin),
    longMin: String(settings.longMin),
    cyclesBeforeLong: String(settings.cyclesBeforeLong),
    autoStartNext: settings.autoStartNext,
  });
  const [errors, setErrors] = useState<ReturnType<typeof validateSettings>>({});
  const [flash, setFlash] = useFlash();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateSettings(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFlash({ kind: 'error', text: 'Some values are out of range. Nothing was saved.' });
      return;
    }
    onSave({ focusMin: +form.focusMin, shortMin: +form.shortMin, longMin: +form.longMin, cyclesBeforeLong: +form.cyclesBeforeLong, autoStartNext: form.autoStartNext });
    setFlash({ kind: 'success', text: 'Settings saved. They apply from the next block (or now, if the timer is idle).' });
  }
  const num = (k: 'focusMin' | 'shortMin' | 'longMin' | 'cyclesBeforeLong', label: string, hint: string) => (
    <Field label={label} error={errors[k]} hint={hint}>
      {(c) => <input type="number" {...c} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
    </Field>
  );
  return (
    <div className="stack narrow">
      <div className="page-head"><div><p className="eyebrow">Workspace · Settings</p><h1>Your <em>cycle</em></h1><p>Tune focus and break lengths to how you work.</p></div></div>
      <form className="card stack" onSubmit={submit} noValidate>
        <div className="form-grid">
          {num('focusMin', 'Focus length (minutes)', '1–120. Classic Pomodoro is 25.')}
          {num('shortMin', 'Short break (minutes)', '1–30')}
          {num('longMin', 'Long break (minutes)', '1–60')}
          {num('cyclesBeforeLong', 'Focus blocks before a long break', '2–8')}
        </div>
        <label className="check"><input type="checkbox" checked={form.autoStartNext} onChange={(e) => setForm({ ...form, autoStartNext: e.target.checked })} /> Start the next block automatically</label>
        <label className="check"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Play a short chime when a block ends</label>
        <div className="row">
          <button type="submit" className="btn btn-primary">Save settings</button>
          <button type="button" className="btn" onClick={() => setForm({ ...form, focusMin: '25', shortMin: '5', longMin: '15', cyclesBeforeLong: '4' })}>Use classic 25/5/15</button>
        </div>
        {flash && <Notice kind={flash.kind}>{flash.text}</Notice>}
      </form>
    </div>
  );
}
