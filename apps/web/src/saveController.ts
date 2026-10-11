import type { Design } from '@holecraft/core';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export interface SaveOptions {
	/** How long to wait after the last change before saving. */
	delayMs?: number;
	/** Waits before each retry after a failed save; the last one repeats. */
	retryDelaysMs?: readonly number[];
	/** False for failures that retrying cannot fix (the design was deleted, the server rejected it). */
	shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_DELAY_MS = 800;
const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 15_000];

/**
 * Autosave. Tell it about each new version of the design and it saves the latest one shortly after
 * the changes stop, one save at a time, so a burst of edits (or a drag) costs a single save. If a
 * save fails it says so and keeps trying with a growing pause, always with the newest version.
 *
 * The save itself is injected, so this knows nothing about HTTP and is tested with a fake clock.
 */
export class SaveController {
	private readonly delayMs: number;
	private readonly retryDelays: readonly number[];
	private readonly shouldRetry: (error: unknown) => boolean;

	private current: SaveStatus = 'saved';
	private error: Error | null = null;
	/** The newest version not yet saved. Stays set through failures so retries use the latest. */
	private latest: Design | null = null;
	private lastSaved: Design | null = null;
	private saving = false;
	private failures = 0;
	private disposed = false;
	private flushing = false;
	private pause: ReturnType<typeof setTimeout> | null = null;
	private retry: ReturnType<typeof setTimeout> | null = null;
	private waiters: Array<() => void> = [];

	constructor(
		private readonly save: (design: Design) => Promise<void>,
		private readonly onStatus: (status: SaveStatus) => void,
		options: SaveOptions = {},
	) {
		this.delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
		this.retryDelays = options.retryDelaysMs?.length ? options.retryDelaysMs : DEFAULT_RETRY_DELAYS_MS;
		this.shouldRetry = options.shouldRetry ?? (() => true);
	}

	get status(): SaveStatus {
		return this.current;
	}

	/** Why the last save failed, while the status is "error". */
	get lastError(): Error | null {
		return this.error;
	}

	/** The newest version that is not saved yet (including one being saved right now), or null. */
	pendingDesign(): Design | null {
		return this.latest;
	}

	/** Records a new version of the design. Does nothing for a version it already has or has saved. */
	schedule(design: Design): void {
		if (this.disposed || design === this.latest || design === this.lastSaved) return;
		this.latest = design;
		this.set('dirty');
		if (this.pause) clearTimeout(this.pause);
		this.pause = setTimeout(() => {
			this.pause = null;
			this.startIfIdle();
		}, this.delayMs);
	}

	/** Saves right now rather than after the pause. Resolves once everything is saved, or has failed. */
	flush(): Promise<void> {
		if (this.disposed || (this.latest === null && !this.saving)) return Promise.resolve();
		this.flushing = true;
		if (this.pause) {
			clearTimeout(this.pause);
			this.pause = null;
		}
		const done = new Promise<void>((resolve) => this.waiters.push(resolve));
		this.startIfIdle();
		return done;
	}

	dispose(): void {
		this.disposed = true;
		if (this.pause) clearTimeout(this.pause);
		if (this.retry) clearTimeout(this.retry);
		this.pause = this.retry = null;
		this.release();
	}

	private startIfIdle(): void {
		if (this.disposed || this.saving || !this.latest) return;
		if (this.retry) {
			clearTimeout(this.retry);
			this.retry = null;
		}
		const design = this.latest;
		this.saving = true;
		this.set('saving');
		this.save(design).then(
			() => this.succeeded(design),
			(error: unknown) => this.failed(error),
		);
	}

	private succeeded(design: Design): void {
		this.saving = false;
		if (this.disposed) return;
		this.lastSaved = design;
		this.failures = 0;
		this.error = null;

		if (this.latest !== design) {
			// Something newer arrived while this was saving: save it as soon as its pause is up.
			this.set('dirty');
			if (this.pause === null || this.flushing) this.startIfIdle();
			return;
		}
		this.latest = null;
		this.flushing = false;
		this.set('saved');
		this.release();
	}

	private failed(error: unknown): void {
		this.saving = false;
		if (this.disposed) return;
		this.error = error instanceof Error ? error : new Error(String(error));
		this.set('error');

		if (this.shouldRetry(error)) {
			const wait = this.retryDelays[Math.min(this.failures, this.retryDelays.length - 1)]!;
			this.failures++;
			this.retry = setTimeout(() => {
				this.retry = null;
				this.startIfIdle();
			}, wait);
		}
		this.flushing = false;
		this.release();
	}

	private set(status: SaveStatus): void {
		if (status === this.current) return;
		this.current = status;
		this.onStatus(status);
	}

	private release(): void {
		const waiting = this.waiters;
		this.waiters = [];
		for (const resolve of waiting) resolve();
	}
}
