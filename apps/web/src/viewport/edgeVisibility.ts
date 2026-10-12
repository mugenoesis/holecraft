import type { Vec3 } from '@holecraft/core';

/**
 * Remembers which pieces of the Edge tool's edges are hidden behind the model. Each check is a ray through the whole mesh, so
 * there are far too many to do on every redraw: they are done a chunk at a time (so the page stays responsive), a newer request
 * replaces an older one, and a piece not yet checked is assumed visible rather than flickering away.
 */
export class SegmentVisibility {
	private readonly known = new Map<string, boolean>();
	private run = 0;

	constructor(
		/** Whether a point (the middle of a piece) can be seen from the camera. */
		private readonly canSee: (mid: Vec3) => boolean,
		/** Called after each chunk, so the page can redraw with what is known so far. */
		private readonly onChange: () => void,
		private readonly schedule: (task: () => void) => void = (task) => void setTimeout(task, 0),
		private readonly chunk = 150,
	) {}

	/** True unless the piece has been checked and found hidden. */
	visible(key: string): boolean {
		return this.known.get(key) !== false;
	}

	/** Checks these pieces from the camera as it is now, replacing any check still going. */
	refresh(items: readonly { key: string; mid: Vec3 }[]): void {
		const run = ++this.run;
		let next = 0;
		const step = () => {
			if (run !== this.run) return;
			for (const end = Math.min(next + this.chunk, items.length); next < end; next++) {
				const item = items[next]!;
				this.known.set(item.key, this.canSee(item.mid));
			}
			this.onChange();
			if (next < items.length) this.schedule(step);
		};
		this.schedule(step);
	}

	/** Stops any check still going. */
	cancel(): void {
		this.run++;
	}

	/** Forgets everything found so far, and stops any check still going (the shape the keys named has changed). */
	reset(): void {
		this.cancel();
		this.known.clear();
	}
}
