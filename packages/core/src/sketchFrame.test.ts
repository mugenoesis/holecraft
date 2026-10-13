import { describe, expect, it } from 'vitest';
import type { Vec3 } from './camera.ts';
import { composeTransform } from './rotation.ts';
import { frameOfNode, frameOfPlane, fromFrame, toFrame } from './sketchFrame.ts';

const near = (got: readonly number[], want: readonly number[]) => {
	for (const [i, v] of got.entries()) expect(v).toBeCloseTo(want[i]!, 6);
};

describe('the frame a sketch is drawn in', () => {
	it('is the world’s x and y on the floor, with the origin where the plane is', () => {
		const f = frameOfPlane({ origin: [5, 6, 0], normal: [0, 0, 1] });
		near(f.u, [1, 0, 0]);
		near(f.v, [0, 1, 0]);
		near(f.normal, [0, 0, 1]);
		expect(toFrame(f, [8, 10, 0])).toEqual([3, 4]);
		near(fromFrame(f, [3, 4]), [8, 10, 0]);
	});

	it('is x along the wall and y up it on a wall', () => {
		const f = frameOfPlane({ origin: [0, -50, 0], normal: [0, -1, 0] });
		near(f.u, [1, 0, 0]);
		near(f.v, [0, 0, 1]);
		near(fromFrame(f, [10, 20]), [10, -50, 20]);
	});

	it('is the shape’s own x, y and z for a shape, however it is turned, so what is drawn lands where the shape’s outlines are', () => {
		const turn = [0, -1, 0, 1, 0, 0, 0, 0, 1]; // a quarter turn about z, row-major: x goes to world y
		const node = { transform: composeTransform([10, 20, 5], turn as never) };
		const f = frameOfNode(node);
		near(f.origin, [10, 20, 5]);
		near(f.u, [0, 1, 0]);
		near(f.v, [-1, 0, 0]);
		near(f.normal, [0, 0, 1]);
		near(fromFrame(f, [3, 4]), [10 - 4, 20 + 3, 5]);
	});

	it('goes there and back: a point on the plane keeps its coordinates', () => {
		const f = frameOfPlane({ origin: [1, 2, 3], normal: [0.6, 0.8, 0] });
		const p: [number, number] = [7.5, -2.25];
		near(toFrame(f, fromFrame(f, p)), p);
		const world: Vec3 = fromFrame(f, p);
		expect(toFrame(f, world)).toEqual(expect.arrayContaining([expect.closeTo(7.5, 6), expect.closeTo(-2.25, 6)]));
	});
});
