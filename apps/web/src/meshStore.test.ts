import type { MeshData } from '@holecraft/core';
import { describe, expect, it, vi } from 'vitest';
import { MeshStore } from './meshStore.ts';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const mesh = (): MeshData => ({ positions: new Float32Array([0, 0, 0]), indices: new Uint32Array([0, 0, 0]) });
const flush = () => new Promise((r) => setTimeout(r, 0));

function make(fetcher = vi.fn(async () => mesh())) {
  const onChange = vi.fn();
  return { store: new MeshStore(fetcher, onChange), fetcher, onChange };
}

describe('MeshStore', () => {
  it('starts empty', () => {
    expect(make().store.table.size).toBe(0);
  });

  it('fetches a wanted model once and then has it', async () => {
    const { store, fetcher, onChange } = make();
    store.want([A]);
    await flush();
    expect(fetcher).toHaveBeenCalledWith(A);
    expect(store.table.has(A)).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it('does not fetch the same model twice, even when asked while it is still downloading', async () => {
    const { store, fetcher } = make();
    store.want([A]);
    store.want([A, B]);
    await flush();
    store.want([A, B]);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('replaces the table with a new one on every change, so views can tell', async () => {
    const { store } = make();
    const before = store.table;
    store.want([A]);
    await flush();
    expect(store.table).not.toBe(before);
    expect(before.size).toBe(0);
  });

  it('accepts a model it was just given (an import) without fetching', () => {
    const { store, fetcher } = make();
    const m = mesh();
    store.add(A, m);
    store.want([A]);
    expect(store.table.get(A)).toBe(m);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('remembers a failure and does not keep retrying', async () => {
    const { store, fetcher } = make(vi.fn(async () => Promise.reject(new Error('gone'))));
    store.want([A]);
    await flush();
    store.want([A]);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.failed.has(A)).toBe(true);
    expect(store.table.has(A)).toBe(false);
  });

  it('does nothing after it is disposed', async () => {
    const { store, onChange } = make();
    store.want([A]);
    store.dispose();
    await flush();
    expect(onChange).not.toHaveBeenCalled();
    expect(store.table.size).toBe(0);
  });
});
