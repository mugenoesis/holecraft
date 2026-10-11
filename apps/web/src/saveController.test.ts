import { createEmptyDesign, type Design } from '@holecraft/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveController, type SaveStatus } from './saveController.ts';

interface Call {
  design: Design;
  resolve: () => void;
  reject: (error: Error) => void;
}

let calls: Call[];
let statuses: SaveStatus[];
let controller: SaveController;

const design = (name: string): Design => ({ ...createEmptyDesign('d'), name });

function make(opts: ConstructorParameters<typeof SaveController>[2] = {}) {
  calls = [];
  statuses = [];
  controller = new SaveController(
    (d) => new Promise<void>((resolve, reject) => calls.push({ design: d, resolve, reject })),
    (s) => statuses.push(s),
    opts,
  );
}

/** Let promise callbacks run without moving the fake clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  make();
});

afterEach(() => {
  controller.dispose();
  vi.useRealTimers();
});

describe('SaveController', () => {
  it('starts out saved, and saves nothing until it is told about a change', async () => {
    expect(controller.status).toBe('saved');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(0);
  });

  it('marks the design unsaved at once, then saves it after a short pause', async () => {
    controller.schedule(design('a'));
    expect(controller.status).toBe('dirty');
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(1);
    expect(controller.status).toBe('saving');

    calls[0]!.resolve();
    await settle();
    expect(controller.status).toBe('saved');
    expect(statuses).toEqual(['dirty', 'saving', 'saved']);
  });

  it('waits for the changes to stop, then saves only the latest', async () => {
    controller.schedule(design('a'));
    await vi.advanceTimersByTimeAsync(500);
    controller.schedule(design('b'));
    await vi.advanceTimersByTimeAsync(500);
    controller.schedule(design('c'));
    await vi.advanceTimersByTimeAsync(799);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.design.name).toBe('c');
  });

  it('keeps one save in flight, and saves what changed meanwhile straight after', async () => {
    controller.schedule(design('a'));
    await vi.advanceTimersByTimeAsync(800);
    controller.schedule(design('b'));
    await vi.advanceTimersByTimeAsync(5000); // long past the delay, but the first save is still running
    expect(calls).toHaveLength(1);

    calls[0]!.resolve();
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.design.name).toBe('b');
    expect(controller.status).toBe('saving');

    calls[1]!.resolve();
    await settle();
    expect(controller.status).toBe('saved');
  });

  it('is not saved while a newer change is still waiting', async () => {
    controller.schedule(design('a'));
    await vi.advanceTimersByTimeAsync(800);
    controller.schedule(design('b'));
    calls[0]!.resolve();
    await settle();
    expect(controller.status).not.toBe('saved');
  });

  it('ignores being told about the same design again', async () => {
    const d = design('a');
    controller.schedule(d);
    await vi.advanceTimersByTimeAsync(800);
    calls[0]!.resolve();
    await settle();
    controller.schedule(d);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);
    expect(controller.status).toBe('saved');
  });
});

describe('SaveController.pendingDesign', () => {
  it('is the newest version that has not been saved, or null when everything is', async () => {
    expect(controller.pendingDesign()).toBeNull();
    controller.schedule(design('a'));
    controller.schedule(design('b'));
    expect(controller.pendingDesign()?.name).toBe('b');
    await vi.advanceTimersByTimeAsync(800);
    expect(controller.pendingDesign()?.name).toBe('b'); // still in flight
    calls[0]!.resolve();
    await settle();
    expect(controller.pendingDesign()).toBeNull();
  });

  it('keeps the design after a failed save, so nothing is lost', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    controller.schedule(design('a'));
    await vi.advanceTimersByTimeAsync(800);
    calls[0]!.reject(new Error('down'));
    await settle();
    expect(controller.pendingDesign()?.name).toBe('a');
  });
});

describe('SaveController.flush', () => {
  it('saves straight away instead of waiting out the pause, and resolves once saved', async () => {
    controller.schedule(design('a'));
    let done = false;
    void controller.flush().then(() => (done = true));
    await settle();
    expect(calls).toHaveLength(1);
    expect(done).toBe(false);
    calls[0]!.resolve();
    await settle();
    expect(done).toBe(true);
    expect(controller.status).toBe('saved');
  });

  it('resolves immediately when there is nothing to save', async () => {
    await expect(controller.flush()).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('waits for a save already running, then saves anything newer too', async () => {
    controller.schedule(design('a'));
    await vi.advanceTimersByTimeAsync(800);
    controller.schedule(design('b'));
    let done = false;
    void controller.flush().then(() => (done = true));
    await settle();
    expect(done).toBe(false);
    calls[0]!.resolve();
    await settle();
    expect(calls).toHaveLength(2);
    calls[1]!.resolve();
    await settle();
    expect(done).toBe(true);
  });
});

describe('SaveController failures', () => {
  it('shows an error and tries again after a delay, with the latest design', async () => {
    controller.schedule(design('a'));
    await vi.advanceTimersByTimeAsync(800);
    calls[0]!.reject(new Error('offline'));
    await settle();
    expect(controller.status).toBe('error');

    controller.schedule(design('b')); // edits made while failing are kept
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(2); // saved on the normal pause too
    expect(calls[1]!.design.name).toBe('b');
    calls[1]!.resolve();
    await settle();
    expect(controller.status).toBe('saved');
  });

  it('keeps retrying with a growing delay until it works', async () => {
    make({ retryDelaysMs: [1000, 3000, 9000] });
    controller.schedule(design('a'));
    await vi.advanceTimersByTimeAsync(800);
    calls[0]!.reject(new Error('down'));
    await settle();

    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    calls[1]!.reject(new Error('down'));
    await settle();

    await vi.advanceTimersByTimeAsync(2999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);
    calls[2]!.reject(new Error('down'));
    await settle();

    await vi.advanceTimersByTimeAsync(9000);
    expect(calls).toHaveLength(4); // the last delay repeats
    calls[3]!.resolve();
    await settle();
    expect(controller.status).toBe('saved');
  });

  it('gives up when told the failure is permanent, and says so', async () => {
    make({ shouldRetry: () => false });
    controller.schedule(design('a'));
    await vi.advanceTimersByTimeAsync(800);
    calls[0]!.reject(new Error('gone'));
    await settle();
    expect(controller.status).toBe('error');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
    expect(controller.lastError?.message).toBe('gone');
  });

  it('flush resolves even if the save failed, so leaving the page is never blocked forever', async () => {
    controller.schedule(design('a'));
    const flushed = controller.flush();
    await settle();
    calls[0]!.reject(new Error('nope'));
    await settle();
    await expect(flushed).resolves.toBeUndefined();
    expect(controller.status).toBe('error');
  });
});

describe('SaveController.dispose', () => {
  it('stops everything: no timers, no saves, no more status changes', async () => {
    controller.schedule(design('a'));
    controller.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(0);

    make();
    controller.schedule(design('a'));
    await vi.advanceTimersByTimeAsync(800);
    const before = statuses.length;
    controller.dispose();
    calls[0]!.resolve();
    await settle();
    expect(statuses).toHaveLength(before);
  });
});
