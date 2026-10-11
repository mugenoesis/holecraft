import {
  addShape,
  createEmptyDesign,
  groupNodes,
  moveNodes,
  renameNode,
  setNodeMode,
  setShapeSize,
  type Design,
} from '@holecraft/core';
import type { GroupMesh, Subtree } from '@holecraft/geometry';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { GeometryService } from './GeometryService.ts';

interface Job {
  subtree: Subtree;
  resolve: (mesh: GroupMesh | null) => void;
  reject: (error: Error) => void;
}

let jobs: Job[];
let onChange: Mock<() => void>;
let service: GeometryService;

const mesh = (n: number): GroupMesh => ({ positions: new Float32Array([n, n, n]), indices: new Uint32Array([0, 0, 0]) });
const flush = () => new Promise((r) => setTimeout(r, 0));

function make(cacheSize?: number) {
  jobs = [];
  onChange = vi.fn<() => void>();
  service = new GeometryService(
    (subtree) => new Promise((resolve, reject) => jobs.push({ subtree, resolve, reject })),
    onChange,
    cacheSize ? { cacheSize } : undefined,
  );
}

beforeEach(() => make());

function scene(): Design {
  let d = createEmptyDesign('d');
  d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
  d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
  d = addShape(d, 'sphere', [60, 0], { id: 's' }).design;
  d = addShape(d, 'box', [0, 80], { id: 'x' }).design;
  d = addShape(d, 'box', [60, 80], { id: 'y' }).design;
  return groupNodes(d, ['a', 'h'], { id: 'g' }).design;
}

/** Resolve the oldest job and let the service react. */
async function finish(m: GroupMesh | null = mesh(1)) {
  jobs.shift()!.resolve(m);
  await flush();
}

describe('GeometryService.update', () => {
  it('does nothing when there are no groups', () => {
    service.update(createEmptyDesign('d'));
    expect(jobs).toHaveLength(0);
    expect(service.results().size).toBe(0);
    expect(service.busy).toBe(false);
  });

  it('asks for the shape of each top-level solid group, and shows nothing until it arrives', () => {
    service.update(scene());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.subtree.rootId).toBe('g');
    expect(Object.keys(jobs[0]!.subtree.nodes).sort()).toEqual(['a', 'g', 'h']);
    expect(service.results().size).toBe(0);
    expect(service.busy).toBe(true);
  });

  it('stores the result and tells the listener when it arrives', async () => {
    service.update(scene());
    await finish(mesh(7));
    expect(service.results().get('g')?.mesh?.positions[0]).toBe(7);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(service.busy).toBe(false);
  });

  it('does not recompute when only the group\'s place, name or colour changed', async () => {
    const d = scene();
    service.update(d);
    await finish();
    service.update(moveNodes(d, ['g'], [10, 0, 0]));
    service.update(renameNode(d, 'g', 'Bracket'));
    expect(jobs).toHaveLength(0);
    expect(service.results().has('g')).toBe(true);
  });

  it('does not recompute for changes elsewhere in the design', async () => {
    const d = scene();
    service.update(d);
    await finish();
    service.update(moveNodes(d, ['s'], [5, 5, 0]));
    expect(jobs).toHaveLength(0);
  });

  it('recomputes when a shape inside changes, keeping the old result until the new one arrives', async () => {
    const d = scene();
    service.update(d);
    await finish(mesh(1));
    service.update(setShapeSize(d, 'a', { width: 30 }));
    expect(jobs).toHaveLength(1);
    expect(service.results().get('g')?.mesh?.positions[0]).toBe(1); // still the old shape
    await finish(mesh(2));
    expect(service.results().get('g')?.mesh?.positions[0]).toBe(2);
  });

  it('stores an empty result (everything cut away) as such', async () => {
    service.update(scene());
    await finish(null);
    expect(service.results().get('g')).toMatchObject({ mesh: null });
  });

  it('only evaluates top-level solid groups, not groups nested in them or hole groups', () => {
    let d = scene();
    d = groupNodes(d, ['g', 's'], { id: 'outer' }).design;
    service.update(d);
    expect(jobs.map((j) => j.subtree.rootId)).toEqual(['outer']);

    make();
    service.update(setNodeMode(d, ['outer'], 'hole'));
    expect(jobs).toHaveLength(0);
  });

  it('works through several groups one at a time', async () => {
    let d = scene();
    d = groupNodes(d, ['x', 'y'], { id: 'g2' }).design;
    service.update(d);
    expect(jobs).toHaveLength(1); // only one evaluation in flight
    await finish(mesh(1));
    expect(jobs).toHaveLength(1);
    await finish(mesh(2));
    expect([...service.results().keys()].sort()).toEqual(['g', 'g2']);
  });
});

describe('GeometryService: rapid edits', () => {
  it('skips the intermediate steps of a drag, computing only the first and the last', async () => {
    const d = scene();
    service.update(d);
    await finish(mesh(1));
    service.update(setShapeSize(d, 'a', { width: 21 })); // starts straight away
    service.update(setShapeSize(d, 'a', { width: 22 })); // queued...
    service.update(setShapeSize(d, 'a', { width: 23 })); // ...and replaced by this
    service.update(setShapeSize(d, 'a', { width: 24 }));
    expect(jobs).toHaveLength(1);
    await finish(mesh(2));
    expect(jobs).toHaveLength(1);
    const last = jobs[0]!.subtree.nodes.a as unknown as { params: { width: number } };
    expect(last.params.width).toBe(24);
  });

  it('shows an in-flight result that is already out of date, until the right one lands', async () => {
    const d = scene();
    service.update(d);
    service.update(setShapeSize(d, 'a', { width: 30 })); // changed while the first is computing
    await finish(mesh(1)); // the answer for the old shape: better than nothing
    expect(service.results().get('g')?.mesh?.positions[0]).toBe(1);
    await finish(mesh(2));
    expect(service.results().get('g')?.mesh?.positions[0]).toBe(2);
  });

  it('never lets a late answer overwrite a newer cached one', async () => {
    const d = scene();
    const edited = setShapeSize(d, 'a', { width: 30 });
    service.update(d);
    await finish(mesh(1)); // d is now cached
    service.update(edited); // job in flight for the edit
    service.update(d); // user undoes: cached, shown immediately
    expect(service.results().get('g')?.mesh?.positions[0]).toBe(1);
    await finish(mesh(2)); // the edit's answer arrives late
    expect(service.results().get('g')?.mesh?.positions[0]).toBe(1);
  });
});

describe('GeometryService cache', () => {
  it('shows a remembered shape straight away, e.g. after undo', async () => {
    const d = scene();
    const edited = setShapeSize(d, 'a', { width: 30 });
    service.update(d);
    await finish(mesh(1));
    service.update(edited);
    await finish(mesh(2));
    service.update(d);
    expect(jobs).toHaveLength(0);
    expect(service.results().get('g')?.mesh?.positions[0]).toBe(1);
    expect(service.busy).toBe(false);
  });

  it('forgets the oldest shapes beyond its limit', async () => {
    make(2);
    const d = scene();
    const sizes = [21, 22, 23].map((w) => setShapeSize(d, 'a', { width: w }));
    for (const s of sizes) {
      service.update(s);
      await finish(mesh(1));
    }
    service.update(sizes[0]!); // evicted, so it has to be computed again
    expect(jobs).toHaveLength(1);
    await finish();
    service.update(sizes[2]!); // still remembered
    expect(jobs).toHaveLength(0);
  });
});

describe('GeometryService cleanup', () => {
  it('drops the result of a group that was removed, and ignores its late answer', async () => {
    const d = scene();
    service.update(d);
    service.update(createEmptyDesign('d'));
    expect(service.results().size).toBe(0);
    await finish(mesh(1));
    expect(service.results().size).toBe(0);
  });

  it('ignores answers after being disposed', async () => {
    service.update(scene());
    service.dispose();
    await finish(mesh(1));
    expect(service.results().size).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('GeometryService failures', () => {
  it('records a failed group so it can be drawn another way, and tells the listener', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    service.update(scene());
    jobs.shift()!.reject(new Error('boom'));
    await flush();
    expect(service.failed().has('g')).toBe(true);
    expect(service.results().size).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(service.busy).toBe(false);
    warn.mockRestore();
  });

  it('keeps going after a failure, and clears it once the group changes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = scene();
    service.update(d);
    jobs.shift()!.reject(new Error('boom'));
    await flush();
    service.update(setShapeSize(d, 'a', { width: 30 }));
    expect(service.failed().has('g')).toBe(false);
    await finish(mesh(3));
    expect(service.results().get('g')?.mesh?.positions[0]).toBe(3);
  });

  it('does not retry the same failing shape forever', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = scene();
    service.update(d);
    jobs.shift()!.reject(new Error('boom'));
    await flush();
    service.update(d);
    service.update(d);
    expect(jobs).toHaveLength(0);
  });
});
