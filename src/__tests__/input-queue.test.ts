import { describe, it, expect, vi } from 'vitest';
import { InputQueue } from '../services/input-queue';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

describe('InputQueue', () => {
  it('keeps new input out of the active turn and executes it FIFO without overlap', async () => {
    const first = deferred(); const seen: string[] = []; let active = 0; let peak = 0;
    const queue = new InputQueue({ changed: vi.fn(), idle: vi.fn(), error: vi.fn(),
      process: async input => {
        peak = Math.max(peak, ++active); seen.push(input);
        if (input === 'first') await first.promise;
        active--;
      } });
    queue.enqueue('first'); queue.enqueue('second'); queue.enqueue('third');
    expect(seen).toEqual(['first']); expect(queue.pending).toEqual(['second', 'third']);
    first.resolve(); await tick();
    expect(seen).toEqual(['first', 'second', 'third']); expect(peak).toBe(1);
    expect(queue.running).toBe(false);
  });
  it('removes and clears only waiting input, preserving the running job', async () => {
    const first = deferred(); const process = vi.fn(async () => first.promise);
    const changed = vi.fn();
    const queue = new InputQueue({ process, changed, idle: vi.fn(), error: vi.fn() });
    queue.enqueue('running'); queue.enqueue('remove'); queue.enqueue('keep');
    expect(queue.remove(-1)).toBe(false); expect(queue.remove(0)).toBe(true);
    expect(queue.pending).toEqual(['keep']);
    queue.clear(); expect(changed).toHaveBeenLastCalledWith([]);
    expect(queue.running).toBe(true);
    first.resolve(); await tick(); expect(process).toHaveBeenCalledTimes(1);
  });
  it('continues after a failed job and can enqueue more work after becoming idle', async () => {
    const seen: string[] = []; const error = vi.fn();
    const queue = new InputQueue({ initial: ['bad', 'next'], changed: vi.fn(), idle: vi.fn(), error,
      process: async input => { seen.push(input); if (input === 'bad') throw new Error('failed'); } });
    queue.start(); await tick(); queue.enqueue('later'); await tick();
    expect(error).toHaveBeenCalledTimes(1); expect(seen).toEqual(['bad', 'next', 'later']);
  });
  it('stopping during a job preserves remaining messages for restart', async () => {
    const first = deferred(); const changed = vi.fn(); const seen: string[] = [];
    const queue = new InputQueue({ initial: ['first', 'second', 'third'], changed, idle: vi.fn(), error: vi.fn(),
      process: async input => { seen.push(input); await first.promise; } });
    queue.start(); queue.stop(); first.resolve(); await tick();
    expect(seen).toEqual(['first']); expect(queue.pending).toEqual(['second', 'third']);
    expect(changed).toHaveBeenLastCalledWith(['second', 'third']);
  });
});
