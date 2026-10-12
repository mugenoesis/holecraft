import type { EdgeTreatment, Vec3 } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { treatmentCuts } from './edgeCut.ts';

/** The face a cutter's pieces share where one piece ends and the next begins must be the very same triangle, or there is a gap or a step. */
const TOP: Vec3 = [0, 0, 1];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
	const n = Math.hypot(...a);
	return [a[0] / n, a[1] / n, a[2] / n];
};

/**
 * An open edge on the top face (z = 0) of a block, with `bend` degrees of turn at its middle point: along +x, then turned left.
 * The side face is on the right of the edge (the solid is to the left, below), as for a block's top edge seen from above.
 */
function bent(bend: number, kind: EdgeTreatment['kind'] = 'chamfer', size = 1, swapSecond = false): EdgeTreatment {
	const a = (bend * Math.PI) / 180;
	const out: Vec3 = [Math.cos(a), Math.sin(a), 0];
	const side = (d: Vec3): Vec3 => [d[1], -d[0], 0];
	const first: [Vec3, Vec3] = [TOP, side([1, 0, 0])];
	const second: [Vec3, Vec3] = swapSecond ? [side(out), TOP] : [TOP, side(out)];
	return {
		id: 't',
		kind,
		size,
		points: [
			[0, 0, 0],
			[10, 0, 0],
			[10 + 10 * out[0], 10 * out[1], 0],
		],
		normals: [first, second],
	};
}

describe('the pieces of a cut along an edge', () => {
	it('meet in exactly the same cross-section, so there is no gap and no step between them (a bend of 40 degrees)', () => {
		const [one, two] = treatmentCuts(bent(40));
		expect(one!.prism.slice(3)).toEqual(two!.prism.slice(0, 3));
	});

	it('wrap round a closed edge: the last piece ends where the first begins', () => {
		const ring = (n: number): EdgeTreatment => {
			const points = Array.from(
				{ length: n + 1 },
				(_, i) => [3 * Math.cos((2 * Math.PI * (i % n)) / n), 3 * Math.sin((2 * Math.PI * (i % n)) / n), 0] as Vec3,
			);
			// a hole's rim: the solid is outside the circle, so the side face looks in towards the middle
			const normals = Array.from({ length: n }, (_, i) => {
				const mid = (2 * Math.PI * (i + 0.5)) / n;
				return [TOP, [-Math.cos(mid), -Math.sin(mid), 0] as Vec3] as [Vec3, Vec3];
			});
			return { id: 't', kind: 'chamfer', size: 1, points, normals };
		};
		const cuts = treatmentCuts(ring(16));
		expect(cuts).toHaveLength(16);
		expect(cuts[15]!.prism.slice(3)).toEqual(cuts[0]!.prism.slice(0, 3));
	});

	it('cut the section square to the bisector of a bend, not square to either piece', () => {
		const [one] = treatmentCuts(bent(60));
		const [tip, onTop, onSide] = one!.prism.slice(3) as [Vec3, Vec3, Vec3]; // the section at the bend
		const normal = unit(cross(sub(onTop, tip), sub(onSide, tip)));
		const bisector = unit([1 + Math.cos(Math.PI / 3), Math.sin(Math.PI / 3), 0]);
		expect(Math.abs(dot(normal, bisector))).toBeGreaterThan(0.999);
	});

	it('are the same whichever order the two faces were stored in for each piece', () => {
		expect(treatmentCuts(bent(40, 'chamfer', 1, true))).toEqual(treatmentCuts(bent(40)));
		expect(treatmentCuts(bent(40, 'round', 1, true))).toEqual(treatmentCuts(bent(40, 'round')));
	});

	it('cut a chamfer back the size along each face at the bend, measured square to the edge', () => {
		const [one] = treatmentCuts(bent(40, 'chamfer', 2));
		const [tip, onTop, onSide] = one!.prism.slice(3) as [Vec3, Vec3, Vec3];
		expect(dist(onTop, tip)).toBeGreaterThan(2);
		expect(dist(onTop, tip)).toBeLessThan(2.1); // a hair more for the sliver margin
		expect(dist(onSide, tip)).toBeGreaterThan(2);
		expect(dist(onSide, tip)).toBeLessThan(2.1);
	});
});

describe('the tube a round leaves in place', () => {
	it('reaches past a bend by radius * tan(half the turn), so two straight tubes leave no gap on the outside', () => {
		const [one, two] = treatmentCuts(bent(60, 'round', 2));
		// the first tube runs on past the bend's centre, and the second starts back before it: the two ends overlap
		const firstEnds = one!.keep!.to;
		const secondStarts = two!.keep!.from;
		const reach = 2 * Math.tan(Math.PI / 6); // radius * tan(half the 60 degree turn)
		// the ends lie on two axes 60 degrees apart, each `reach` past the centre, so they are 2 * reach * cos(30 degrees) apart
		// (about: at so coarse a bend the mitre stretches the section a little, by 1 / cos(30 degrees), which a 64-sided rim never meets)
		const expected = 2 * reach * Math.cos(Math.PI / 6);
		expect(dist(firstEnds, secondStarts)).toBeGreaterThan(expected * 0.95);
		expect(dist(firstEnds, secondStarts)).toBeLessThan(expected * 1.15);
	});

	it('is a hair wider than the round asks for, so its flats cover the true circle', () => {
		const [one] = treatmentCuts(bent(0, 'round', 2));
		expect(one!.keep!.radius).toBeGreaterThan(2);
		expect(one!.keep!.radius).toBeLessThan(2.01);
	});

	it('is not added for a chamfer', () => {
		expect(treatmentCuts(bent(40)).every((c) => c.keep === undefined)).toBe(true);
	});
});
