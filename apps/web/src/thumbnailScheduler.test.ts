import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailScheduler } from './thumbnailScheduler.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function make(run: () => Promise<void> = vi.fn(async () => undefined)) {
  return { run, scheduler: new ThumbnailScheduler(run, 2000) };
}

describe('ThumbnailScheduler', () => {
  it('takes the picture after the design has stayed ready for a while', async () => {
    const { run, scheduler } = make();
    scheduler.notify(true, 'v1');
    await vi.advanceTimersByTimeAsync(1999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('starts the wait again when the design changes in the meantime', async () => {
    const { run, scheduler } = make();
    scheduler.notify(true, 'v1');
    await vi.advanceTimersByTimeAsync(1500);
    scheduler.notify(true, 'v2');
    await vi.advanceTimersByTimeAsync(1500);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the design is not ready (unsaved, or still being worked out)', async () => {
    const { run, scheduler } = make();
    scheduler.notify(false, 'v1');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('gives up a pending picture when the design stops being ready', async () => {
    const { run, scheduler } = make();
    scheduler.notify(true, 'v1');
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.notify(false, 'v2');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('takes it once per version, however often it is told the same thing', async () => {
    const { run, scheduler } = make();
    scheduler.notify(true, 'v1');
    await vi.advanceTimersByTimeAsync(2100);
    scheduler.notify(true, 'v1');
    scheduler.notify(true, 'v1');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('takes another when the design changes again afterwards', async () => {
    const { run, scheduler } = make();
    scheduler.notify(true, 'v1');
    await vi.advanceTimersByTimeAsync(2100);
    scheduler.notify(true, 'v2');
    await vi.advanceTimersByTimeAsync(2100);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not let a failure escape, and tries that version again next time it is told', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const { scheduler } = make(run);
    scheduler.notify(true, 'v1');
    await vi.advanceTimersByTimeAsync(2100);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.notify(true, 'v1');
    await vi.advanceTimersByTimeAsync(2100);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not start a second picture while one is still being taken', async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const { scheduler } = make(run);
    scheduler.notify(true, 'v1');
    await vi.advanceTimersByTimeAsync(2100);
    scheduler.notify(true, 'v2');
    await vi.advanceTimersByTimeAsync(2100);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    // The change that came in meanwhile is not forgotten: it gets its own picture, with no further prompting.
    await vi.advanceTimersByTimeAsync(2100);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not keep retrying a version that fails, when nothing has changed', async () => {
    const run = vi.fn().mockRejectedValue(new Error('offline'));
    const { scheduler } = make(run);
    scheduler.notify(true, 'v1');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('stops everything when disposed', async () => {
    const { run, scheduler } = make();
    scheduler.notify(true, 'v1');
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).not.toHaveBeenCalled();
    scheduler.notify(true, 'v2');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).not.toHaveBeenCalled();
  });
});
