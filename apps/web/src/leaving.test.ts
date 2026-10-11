import { describe, expect, it } from 'vitest';
import { afterLeaving, trackLeaving } from './leaving.ts';

describe('leaving the editor', () => {
  it('resolves straight away when nothing is being saved', async () => {
    await expect(afterLeaving()).resolves.toBeUndefined();
  });

  it('waits for a save that is still in flight', async () => {
    let finish!: () => void;
    trackLeaving(new Promise<void>((r) => (finish = r)));
    let done = false;
    const waiting = afterLeaving().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    finish();
    await waiting;
    expect(done).toBe(true);
  });

  it('does not get stuck or throw when the save fails', async () => {
    trackLeaving(Promise.reject(new Error('offline')));
    await expect(afterLeaving()).resolves.toBeUndefined();
  });
});
