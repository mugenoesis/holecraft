import type { Design, NodeId } from '@holecraft/core';
import { rootSolidGroups, subtreeHash, subtreeOf, type GroupMesh, type Subtree } from '@holecraft/geometry';

export type Evaluator = (subtree: Subtree) => Promise<GroupMesh | null>;

/** The shape of a group: `mesh` is null when the holes left nothing of it. */
export interface GroupResult {
  /** Which version of the group this is the shape of (see `subtreeHash`). */
  hash: string;
  mesh: GroupMesh | null;
}

interface Job {
  hash: string;
  subtree: Subtree;
}

const DEFAULT_CACHE_SIZE = 48;

/**
 * Decides when each top-level group's shape needs working out, and hands the work to an
 * `Evaluator` (a web worker in the app) one job at a time.
 *
 * - Results are cached by content hash, so undo, or moving or renaming a group, costs nothing.
 * - While a group's new shape is being computed its previous shape stays available, so the
 *   view never flickers back to the raw ingredients mid-edit.
 * - During a drag only the first and the latest state of a group are computed; the ones in
 *   between are skipped.
 * - A group whose evaluation fails is reported through `failed()`, so it can be drawn some
 *   other way, and is not retried until it changes.
 */
export class GeometryService {
  private readonly cache = new Map<string, GroupMesh | null>();
  private readonly shapes = new Map<NodeId, GroupResult>();
  private readonly wanted = new Map<NodeId, string>();
  private readonly queue = new Map<NodeId, Job>();
  private readonly failures = new Map<NodeId, string>();
  private inFlight: { id: NodeId; hash: string } | null = null;
  private disposed = false;

  constructor(
    private readonly evaluate: Evaluator,
    private readonly onChange: () => void,
    private readonly opts: { cacheSize?: number } = {},
  ) {}

  /** True while any shape is being computed or waiting to be. */
  get busy(): boolean {
    return this.inFlight !== null || this.queue.size > 0;
  }

  /** The latest known shape of each current top-level solid group. May lag behind the design while `busy`. */
  results(): ReadonlyMap<NodeId, GroupResult> {
    return this.shapes;
  }

  /** Groups that could not be evaluated in their current state. */
  failed(): ReadonlySet<NodeId> {
    return new Set(this.failures.keys());
  }

  /** Looks at a new version of the design and requests whatever shapes are not already known. */
  update(design: Design): void {
    if (this.disposed) return;
    const ids = rootSolidGroups(design);

    for (const known of [...this.wanted.keys()]) {
      if (ids.includes(known)) continue;
      this.wanted.delete(known);
      this.shapes.delete(known);
      this.queue.delete(known);
      this.failures.delete(known);
    }

    for (const id of ids) {
      const hash = subtreeHash(design, id);
      this.wanted.set(id, hash);
      if (this.failures.has(id) && this.failures.get(id) !== hash) this.failures.delete(id);

      if (this.cache.has(hash)) {
        this.shapes.set(id, { hash, mesh: this.touch(hash) });
        this.queue.delete(id); // anything waiting for this group is out of date now
      } else if (this.failures.get(id) === hash || this.inFlight?.id === id && this.inFlight.hash === hash) {
        // Known to fail, or already being worked on.
      } else {
        // Delete first so the newest request goes to the back of the line.
        this.queue.delete(id);
        this.queue.set(id, { hash, subtree: subtreeOf(design, id) });
      }
    }
    this.pump();
  }

  dispose(): void {
    this.disposed = true;
    this.queue.clear();
    this.shapes.clear();
    this.wanted.clear();
  }

  private pump(): void {
    if (this.inFlight || this.disposed) return;
    const next = this.queue.entries().next();
    if (next.done) return;
    const [id, job] = next.value;
    this.queue.delete(id);
    this.inFlight = { id, hash: job.hash };
    this.evaluate(job.subtree).then(
      (mesh) => this.finish(id, job.hash, mesh),
      (error: unknown) => this.fail(id, job.hash, error),
    );
  }

  private finish(id: NodeId, hash: string, mesh: GroupMesh | null): void {
    this.inFlight = null;
    if (this.disposed) return;
    this.remember(hash, mesh);
    // Use it unless something newer is already showing (e.g. the user undid back to a cached shape).
    if (this.wanted.has(id) && (!this.shapes.has(id) || this.wanted.get(id) === hash)) {
      this.shapes.set(id, { hash, mesh });
      this.onChange();
    }
    this.pump();
  }

  private fail(id: NodeId, hash: string, error: unknown): void {
    this.inFlight = null;
    if (this.disposed) return;
    console.warn(`Could not work out the shape of group ${id}:`, error);
    if (this.wanted.get(id) === hash) {
      this.failures.set(id, hash);
      this.onChange();
    }
    this.pump();
  }

  private touch(hash: string): GroupMesh | null {
    const mesh = this.cache.get(hash) ?? null;
    this.cache.delete(hash);
    this.cache.set(hash, mesh);
    return mesh;
  }

  private remember(hash: string, mesh: GroupMesh | null): void {
    this.cache.delete(hash);
    this.cache.set(hash, mesh);
    const limit = this.opts.cacheSize ?? DEFAULT_CACHE_SIZE;
    while (this.cache.size > limit) this.cache.delete(this.cache.keys().next().value!);
  }
}
