import { describe, expect, it } from 'vitest';
import type { Vec3 } from './camera.ts';
import { IDENTITY } from './design.ts';
import type { MeshEdge } from './edges.ts';
import { composeTransform, eulerToMatrix } from './rotation.ts';
import { snapToEdges, worldEdges } from './rulerSnap.ts';

/** A view straight down the z axis at 10 px per mm: x is across, y is up the screen. The camera is high above, so depth does not shrink anything. */
const top = (p: Vec3) => ({ x: p[0] * 10, y: -p[1] * 10 });
const edge = (points: Vec3[], closed = false): MeshEdge => ({ points, normals: [], closed }) as unknown as MeshEdge;
/** The top face of a 20 mm box standing on the floor: four straight edges at z = 20. */
const square = (): MeshEdge[] => [
	edge([
		[-10, -10, 20],
		[10, -10, 20],
	]),
	edge([
		[10, -10, 20],
		[10, 10, 20],
	]),
	edge([
		[10, 10, 20],
		[-10, 10, 20],
	]),
	edge([
		[-10, 10, 20],
		[-10, -10, 20],
	]),
];
const targets = () => worldEdges(square(), IDENTITY);
const near = (hit: Vec3) => ({ hit, pointer: top(hit) });

describe('snapToEdges', () => {
	it('snaps to a corner within reach, on the corner exactly, and says so', () => {
		const { hit, pointer } = near([9.4, 9.2, 20]); // 8 px from the corner at (10, 10)
		expect(snapToEdges(targets(), top, hit, pointer)).toEqual({ point: [10, 10, 20], kind: 'corner' });
	});

	it('snaps to the middle of an edge, and to the nearest point on it further along', () => {
		expect(snapToEdges(targets(), top, ...args([0.4, 9.5, 20]))).toEqual({ point: [0, 10, 20], kind: 'middle' });
		const along = snapToEdges(targets(), top, ...args([4.1, 9.6, 20]))!;
		expect(along.kind).toBe('edge');
		expect(along.point[0]).toBeCloseTo(4.1, 9);
		expect(along.point.slice(1)).toEqual([10, 20]);
	});

	it('prefers a corner to a middle to an edge when more than one is within reach', () => {
		// a 16 px edge: both corners (8 px away at most) and its middle (2 px away) and the edge itself are all in reach of the pointer
		const tiny = [
			edge([
				[0, 0, 0],
				[1.6, 0, 0],
			]),
		];
		const [hit, pointer] = args([0.9, 0.2, 0]);
		expect(snapToEdges(worldEdges(tiny, IDENTITY), top, hit, pointer)).toEqual({ point: [1.6, 0, 0], kind: 'corner' }); // the nearer corner
		// with no corner in reach, the middle beats the edge
		const [h2, p2] = args([4.2, 0.1, 0]);
		const long = [
			edge([
				[0, 0, 0],
				[8.4, 0, 0],
			]),
		];
		expect(snapToEdges(worldEdges(long, IDENTITY), top, h2, p2)).toEqual({ point: [4.2, 0, 0], kind: 'middle' });
	});

	it('ignores everything outside the reach, and gives nothing', () => {
		expect(snapToEdges(targets(), top, ...args([0, 0, 20]))).toBeNull(); // the middle of the face: 100 px from any edge
		expect(snapToEdges([], top, ...args([0, 0, 0]))).toBeNull();
	});

	it('ignores an edge hidden behind the surface being pointed at: close on screen, far away in the world', () => {
		const back = worldEdges(
			[
				edge([
					[-10, 10, 0],
					[10, 10, 0],
				]),
			],
			IDENTITY,
		); // the bottom edge, 20 mm under the top face being hit
		expect(snapToEdges(back, top, ...args([0.3, 9.7, 20]))).toBeNull();
	});

	it('gives corners only for open edges (a closed loop, a rim, has none), and middles only for straight ones', () => {
		const rim = [
			edge(
				[
					[10, 0, 5],
					[0, 10, 5],
					[-10, 0, 5],
					[0, -10, 5],
				],
				true,
			),
		];
		const hitCorner = snapToEdges(worldEdges(rim, IDENTITY), top, ...args([10.1, 0.1, 5]));
		expect(hitCorner?.kind).toBe('edge'); // on the rim, but no corner there
		const bent = [
			edge([
				[0, 0, 0],
				[5, 5, 0],
				[10, 0, 0],
			]),
		];
		// a bend part-way along one edge (a curve) is not a corner, and a curve has no middle: it is just on the edge
		expect(snapToEdges(worldEdges(bent, IDENTITY), top, ...args([5.1, 5.1, 0]))).toEqual({ point: [5, 5, 0], kind: 'edge' });
		expect(snapToEdges(worldEdges(bent, IDENTITY), top, ...args([0.1, 0.1, 0]))?.kind).toBe('corner'); // its end is
	});

	it('does nothing when the point cannot be placed on the screen', () => {
		expect(snapToEdges(targets(), () => null, [9, 9, 20], { x: 90, y: -90 })).toBeNull();
	});
});

describe('worldEdges', () => {
	it('moves an edge into the world by its shape’s transform (turned, then moved)', () => {
		const move = composeTransform([100, 0, 0], eulerToMatrix([0, 0, 90]));
		const [moved] = worldEdges(
			[
				edge([
					[10, 0, 0],
					[20, 0, 0],
				]),
			],
			move,
		);
		expect(moved!.points.map((p) => p.map((v) => Math.round(v * 1e9) / 1e9 + 0))).toEqual([
			[100, 10, 0],
			[100, 20, 0],
		]);
		expect(moved!.closed).toBe(false);
	});
});

function args(hit: Vec3): [Vec3, { x: number; y: number }] {
	return [hit, top(hit)];
}
