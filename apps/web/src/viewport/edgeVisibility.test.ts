import type { Vec3 } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { SegmentVisibility } from './edgeVisibility.ts';

/** A scheduler the test runs by hand, one task at a time. */
function manual() {
	const tasks: (() => void)[] = [];
	return {
		schedule: (fn: () => void) => tasks.push(fn),
		runOne: () => tasks.shift()?.(),
		pending: () => tasks.length,
		runAll: () => {
			while (tasks.length) tasks.shift()!();
		},
	};
}
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, mid: [i, 0, 0] as Vec3 }));

describe('SegmentVisibility', () => {
	it('treats a piece as visible until it has been checked and found hidden', () => {
		const vis = new SegmentVisibility(
			() => false,
			() => {},
			manual().schedule,
		);
		expect(vis.visible('k0')).toBe(true);
	});

	it('checks pieces a chunk at a time, telling the page after each chunk, so it never blocks for long', () => {
		const s = manual();
		const seen: number[] = [];
		const vis = new SegmentVisibility(
			(mid) => mid[0] % 2 === 0,
			() => seen.push(1),
			s.schedule,
			3,
		);
		vis.refresh(items(7));
		expect(s.pending()).toBe(1);
		s.runOne(); // pieces 0-2
		expect(vis.visible('k1')).toBe(false); // checked: hidden
		expect(vis.visible('k4')).toBe(true); // not checked yet: assumed visible
		expect(seen).toHaveLength(1);
		s.runAll();
		expect([0, 1, 2, 3, 4, 5, 6].map((i) => vis.visible(`k${i}`))).toEqual([true, false, true, false, true, false, true]);
		expect(seen).toHaveLength(3); // 3 + 3 + 1
	});

	it('a newer refresh replaces one still running (the camera moved again)', () => {
		const s = manual();
		const checked: string[] = [];
		const vis = new SegmentVisibility(
			(mid) => {
				checked.push(`${mid[0]}`);
				return true;
			},
			() => {},
			s.schedule,
			2,
		);
		vis.refresh(items(4));
		s.runOne(); // 0, 1
		vis.refresh([{ key: 'new', mid: [99, 0, 0] }]);
		s.runAll();
		expect(checked).toEqual(['0', '1', '99']); // 2 and 3 were never checked
	});

	it('reset forgets what was found, and stops any check still going (the shape changed)', () => {
		const s = manual();
		const vis = new SegmentVisibility(
			() => false,
			() => {},
			s.schedule,
			10,
		);
		vis.refresh(items(2));
		s.runAll();
		expect(vis.visible('k0')).toBe(false);
		vis.refresh(items(2));
		vis.reset();
		s.runAll();
		expect(vis.visible('k0')).toBe(true);
	});

	it('cancel stops the work', () => {
		const s = manual();
		let calls = 0;
		const vis = new SegmentVisibility(
			() => {
				calls++;
				return true;
			},
			() => {},
			s.schedule,
			2,
		);
		vis.refresh(items(6));
		vis.cancel();
		s.runAll();
		expect(calls).toBe(0);
	});
});
