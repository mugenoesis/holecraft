import type { CDPSession, Page } from '@playwright/test';

/** Real touch input through Chrome's DevTools protocol, so the page sees genuine touch pointer events. */
export class Fingers {
	private at = { x: 0, y: 0 };

	private constructor(private readonly cdp: CDPSession) {}

	static async on(page: Page) {
		return new Fingers(await page.context().newCDPSession(page));
	}

	private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) {
		await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
	}

	/** Puts fingers down, moves them in steps, and lifts them. `from` and `to` list one point per finger. */
	async drag(from: { x: number; y: number }[], to: { x: number; y: number }[], steps = 8) {
		const at = (t: number) => from.map((f, i) => ({ x: f.x + (to[i]!.x - f.x) * t, y: f.y + (to[i]!.y - f.y) * t, id: i }));
		await this.send('touchStart', at(0));
		for (let s = 1; s <= steps; s++) await this.send('touchMove', at(s / steps));
		await this.send('touchEnd', []);
	}

	/** Puts one finger down and leaves it there (see moveTo and up), for a press that has to be held. */
	async down(point: { x: number; y: number }) {
		await this.send('touchStart', [{ ...point, id: 0 }]);
		this.at = point;
	}

	/** Slides the finger that is down to a point, in steps. */
	async moveTo(point: { x: number; y: number }, steps = 8) {
		const from = this.at;
		for (let s = 1; s <= steps; s++) {
			await this.send('touchMove', [{ x: from.x + ((point.x - from.x) * s) / steps, y: from.y + ((point.y - from.y) * s) / steps, id: 0 }]);
		}
		this.at = point;
	}

	async up() {
		await this.send('touchEnd', []);
	}

	async tap(point: { x: number; y: number }) {
		await this.send('touchStart', [{ ...point, id: 0 }]);
		await this.send('touchEnd', []);
	}
}
