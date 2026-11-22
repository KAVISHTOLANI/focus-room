import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

afterEach(() => vi.useRealTimers());

describe('Focus Room workflow', () => {
  it('validates settings and saves valid ones', async () => {
    window.location.hash = '/settings';
    const user = userEvent.setup();
    render(<App />);
    const focus = screen.getByLabelText('Focus length (minutes)');
    await user.clear(focus);
    await user.type(focus, '0');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByText(/Focus length must be a whole number/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument();
    await user.clear(focus);
    await user.type(focus, '1');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByText(/Settings saved/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('focus-room:settings')!).focusMin).toBe(1);
  });

  it('runs a focus block for a task and logs it', async () => {
    localStorage.setItem('focus-room:settings', JSON.stringify({ focusMin: 1, shortMin: 1, longMin: 2, cyclesBeforeLong: 4, autoStartNext: false }));
    localStorage.setItem('focus-room:sound', 'false');
    localStorage.setItem('focus-room:history', '[]');
    localStorage.setItem('focus-room:tasks', '[]');
    localStorage.setItem('focus-room:timer', JSON.stringify({ phase: 'focus', status: 'idle', remainingMs: 60000, endsAt: null, startedAt: null, cycleCount: 0 }));
    window.location.hash = '/timer';
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Describe the task.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New task'), 'Write abstract');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('0/2 blocks')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start focus' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText(/Focus block complete/)).toBeInTheDocument();
    expect(screen.getByText('1/2 blocks')).toBeInTheDocument();
    expect(screen.getByTestId('today-total')).toHaveTextContent('1 min');
    expect(screen.getByRole('button', { name: 'Start short break' })).toBeInTheDocument();
  });

  it('refuses to log less than a minute when finishing early', async () => {
    window.location.hash = '/timer';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Start focus' }));
    await user.click(screen.getByRole('button', { name: 'Finish early' }));
    expect(screen.getByText(/Less than a minute/)).toBeInTheDocument();
  });

  it('opens with labelled demo sessions', () => {
    window.location.hash = '/history';
    render(<App />);
    expect(screen.getAllByText('Demo data').length).toBeGreaterThan(0);
  });

  it('shows empty history with a path back to the timer', () => {
    localStorage.setItem('focus-room:history', '[]');
    window.location.hash = '/history';
    render(<App />);
    expect(screen.getByText('No focus sessions yet')).toBeInTheDocument();
  });
});
