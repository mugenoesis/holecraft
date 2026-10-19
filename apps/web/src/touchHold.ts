/** How long a finger has to stay down on a shape to lift it, and how far it may wander meanwhile (a swipe moves further, and scrolls the panel). */
export const HOLD_MS = 350;
export const HOLD_SLOP = 10;

/**
 * Press and hold: tells when a finger has stayed (nearly) still on something long enough to lift it. A finger that moves first is a swipe
 * and one that comes up first is a tap, and neither lifts anything. Pure apart from its timer, so it is tested with fake ones.
 */
export class TouchHold {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private start: { x: number; y: number } | null = null;
	/** True from the moment the hold has lifted the thing until the finger comes up. */
	lifted = false;

	constructor(private readonly onLift: () => void) {}

	down(x: number, y: number): void {
		this.cancel();
		this.start = { x, y };
		this.timer = setTimeout(() => {
			this.timer = null;
			this.lifted = true;
			this.onLift();
		}, HOLD_MS);
	}

	move(x: number, y: number): void {
		if (!this.start || this.lifted) return;
		if (Math.hypot(x - this.start.x, y - this.start.y) > HOLD_SLOP) this.cancel();
	}

	/** The finger came up: whether that ended a lift (so the click that follows is not a tap). */
	up(): boolean {
		const wasLifted = this.lifted;
		this.cancel();
		return wasLifted;
	}

	/** The touch is over without coming up (the browser took it for itself). */
	cancel(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.start = null;
		this.lifted = false;
	}
}
