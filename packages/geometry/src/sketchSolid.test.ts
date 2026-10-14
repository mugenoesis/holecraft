import {
	addShape,
	addSketchShape,
	circleOutline,
	createEmptyDesign,
	type Design,
	flipNodes,
	groupNodes,
	outlineArea,
	rectangleOutline,
	type SketchOutline,
	setNodeMode,
	setShapeSize,
	type WorkPlane,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup, evaluateNode } from './evaluate.ts';
import { collectBodies } from './export.ts';
import { loadManifold } from './load.ts';
import { rootComputedNodes, subtreeHash } from './subtree.ts';
import type { GroupMesh } from './types.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
	M = await loadManifold();
});

const FLOOR: WorkPlane = { origin: [0, 0, 0], normal: [0, 0, 1] };
const volume = (m: GroupMesh | null) => {
	if (!m) return 0;
	let sum = 0;
	const p = m.positions;
	for (let i = 0; i < m.indices.length; i += 3) {
		const [a, b, c] = [m.indices[i]! * 3, m.indices[i + 1]! * 3, m.indices[i + 2]! * 3];
		sum +=
			(p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
				p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
				p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
			6;
	}
	return sum;
};
const bounds = (m: GroupMesh) => {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < m.positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k]!, m.positions[i + k]!);
			max[k] = Math.max(max[k]!, m.positions[i + k]!);
		}
	}
	return { min, max };
};
const sketch = (outlines: SketchOutline[], height = 5, plane = FLOOR): Design => {
	const r = addSketchShape(createEmptyDesign('d'), plane, outlines, height, { id: 's' });
	if (!r.id) throw new Error('refused');
	return r.design;
};
const plate = [rectangleOutline([0, 0], [30, 30])];

describe('a Sketch shape in the CSG engine', () => {
	it('is the drawing extruded: a 20 x 10 rectangle 5 mm thick is 1000 mm3, centred on its origin, standing on z = 0', () => {
		const m = evaluateGroup(M, sketch([rectangleOutline([3, 4], [23, 14])]), 's')!;
		expect(volume(m)).toBeCloseTo(1000, 3);
		const b = bounds(m);
		expect(b.min).toEqual([-10, -5, 0]);
		expect(b.max).toEqual([10, 5, 5]);
	});

	it('leaves a hole where an outline lies inside another: a 30 mm plate with a 10 mm square hole', () => {
		const d = sketch([...plate, rectangleOutline([10, 10], [20, 20])], 4);
		expect(volume(evaluateGroup(M, d, 's'))).toBeCloseTo((900 - 100) * 4, 3);
	});

	it('fills an island inside a hole again, and a drawing of separate pieces is all of them', () => {
		const island = sketch([...plate, rectangleOutline([5, 5], [25, 25]), rectangleOutline([12, 12], [18, 18])], 2);
		expect(volume(evaluateGroup(M, island, 's'))).toBeCloseTo((900 - 400 + 36) * 2, 3);
		const two = sketch([rectangleOutline([0, 0], [10, 10]), rectangleOutline([30, 0], [40, 10])], 3);
		expect(volume(evaluateGroup(M, two, 's'))).toBeCloseTo(200 * 3, 3);
	});

	it('is a round plate for a circle: the polygon’s area times the height', () => {
		const c = circleOutline([0, 0], 10);
		const area = outlineArea(c); // what the engine fills: the circle cut into pieces at the sketch tolerance
		expect(volume(evaluateGroup(M, sketch([c], 6), 's'))).toBeCloseTo(area * 6, 3);
	});

	it('stretches evenly with its box: twice as wide is twice the volume and twice the width, a thicker one is thicker', () => {
		const d = sketch(plate, 4);
		const wide = setShapeSize(d, 's', { width: 60 });
		expect(volume(evaluateGroup(M, wide, 's'))).toBeCloseTo(2 * 900 * 4, 3);
		expect(bounds(evaluateGroup(M, wide, 's')!).max[0]).toBeCloseTo(30, 6);
		const tall = setShapeSize(d, 's', { height: 9 });
		expect(bounds(evaluateGroup(M, tall, 's')!).max[2]).toBeCloseTo(9, 6);
	});

	it('is the mirror image when flipped: a triangle with its corner on the left has it on the right, with the same volume', () => {
		const triangle: SketchOutline = {
			points: [
				[0, 0],
				[30, 0],
				[0, 10],
			],
		};
		const d = sketch([triangle], 2);
		const flipped = flipNodes(d, ['s'], 'x');
		const [a, b] = [evaluateGroup(M, d, 's')!, evaluateGroup(M, flipped, 's')!];
		expect(volume(b)).toBeCloseTo(volume(a), 6);
		// the right angle is at the lower left of the original; mirrored it is at the lower right (the mesh in the shape's own frame)
		const lowestLeft = (m: GroupMesh) => {
			let x = Infinity;
			for (let i = 0; i < m.positions.length; i += 3) if (m.positions[i + 1]! < -4.99) x = Math.min(x, m.positions[i]!);
			return x;
		};
		expect(lowestLeft(a)).toBeCloseTo(-15, 4);
		expect(lowestLeft(b)).toBeCloseTo(-15, 4);
		const centreX = (m: GroupMesh) => {
			let sum = 0;
			let n = 0;
			for (let i = 0; i < m.positions.length; i += 3) {
				if (m.positions[i + 2]! > 1.99 && m.positions[i + 1]! > 4.99) {
					sum += m.positions[i]!;
					n++;
				}
			}
			return sum / n;
		};
		expect(centreX(a)).toBeCloseTo(-15, 4); // the top corner of the triangle is at the left
		expect(centreX(b)).toBeCloseTo(15, 4); // and after the flip at the right
	});

	it('is worked out on its own as a top-level shape (so the view draws the drawing, not a box)', () => {
		const d = sketch(plate);
		expect(rootComputedNodes(d)).toEqual(['s']);
	});

	it('cuts as a hole: a block with the drawing cut out of it loses exactly the drawing', () => {
		let d = addShape(sketch([rectangleOutline([5, 5], [15, 15])], 10), 'box', [0, 0], { id: 'b' }).design;
		d = setShapeSize(d, 'b', { width: 40, depth: 40, height: 3 });
		d = setNodeMode(d, ['s'], 'hole');
		const g = groupNodes(d, ['b', 's'], { id: 'g' }).design;
		expect(volume(evaluateGroup(M, g, 'g'))).toBeCloseTo(40 * 40 * 3 - 100 * 3, 2);
	});

	it('is exported where it stands: drawn on a wall it keeps its volume and lies on the wall', () => {
		const wall: WorkPlane = { origin: [0, -50, 0], normal: [0, -1, 0] };
		const d = sketch([rectangleOutline([0, 5], [20, 25])], 4, wall);
		const [body] = collectBodies(M, d);
		expect(volume(body!.mesh)).toBeCloseTo(20 * 20 * 4, 2);
		const b = bounds(body!.mesh);
		expect(b.max[1]).toBeCloseTo(-50, 5);
		expect(b.min[1]).toBeCloseTo(-54, 5);
		expect(b.min[2]).toBeCloseTo(5, 5);
		expect(b.max[2]).toBeCloseTo(25, 5);
		expect(volume(evaluateNode(M, d, 's'))).toBeCloseTo(1600, 2);
	});

	it('is part of the cache key: another drawing, another height or a different stretch never reuses the old shape', () => {
		const hash = (d: Design) => subtreeHash(d, 's');
		const base = sketch(plate, 4);
		expect(hash(sketch(plate, 4))).toBe(hash(base));
		expect(hash(sketch([rectangleOutline([0, 0], [30, 31])], 4))).not.toBe(hash(base));
		expect(hash(sketch(plate, 5))).not.toBe(hash(base));
		expect(hash(setShapeSize(base, 's', { width: 40 }))).not.toBe(hash(base));
	});

	it('gives nothing, rather than breaking, for a sketch whose drawing is gone (a damaged file)', () => {
		const d = sketch(plate);
		const damaged = { ...d, nodes: { ...d.nodes, s: { ...d.nodes.s!, sketch: undefined } } } as unknown as Design;
		expect(() => evaluateGroup(M, damaged, 's')).not.toThrow();
		expect(volume(evaluateGroup(M, damaged, 's'))).toBe(0);
	});
});

describe('a Sketch shape with curves in the CSG engine', () => {
	const rel = (got: number, want: number, share = 0.004) => expect(Math.abs(got - want) / want).toBeLessThan(share);

	it('is a true round plate for a circle: pi r squared times the thickness, to within the cutting tolerance', () => {
		const m = evaluateGroup(M, sketch([circleOutline([0, 0], 10)], 6), 's')!;
		rel(volume(m), Math.PI * 100 * 6);
		const b = bounds(m);
		expect(b.max[0]).toBeCloseTo(10, 1); // the cut pieces stay within the tolerance (0.02 mm) of the circle
		expect(b.min[1]).toBeCloseTo(-10, 1);
	});

	it('makes a hole of a circle inside a rectangle: the plate less pi r squared', () => {
		const d = sketch([rectangleOutline([0, 0], [40, 40]), circleOutline([20, 20], 8)], 5);
		rel(volume(evaluateGroup(M, d, 's')), (1600 - Math.PI * 64) * 5);
	});

	it('is a D for an arc and a chord: half a disc, 20 wide and 10 deep', () => {
		const d = sketch(
			[
				{
					points: [
						[0, 0],
						[20, 0],
					],
					segments: [1, 'line'],
				},
			],
			4,
		);
		const m = evaluateGroup(M, d, 's')!;
		rel(volume(m), ((Math.PI * 100) / 2) * 4);
		const b = bounds(m);
		expect(b.max[0]! - b.min[0]!).toBeCloseTo(20, 1);
		expect(b.max[1]! - b.min[1]!).toBeCloseTo(10, 1);
	});

	it('stretches a circle into a true ellipse: made 40 wide and 10 deep it has the area of pi a b', () => {
		const d = setShapeSize(sketch([circleOutline([0, 0], 10)], 3), 's', { width: 40, depth: 10 });
		rel(volume(evaluateGroup(M, d, 's')), Math.PI * 20 * 5 * 3);
	});

	it('is the mirror image when a D is flipped, with the same volume', () => {
		const d = sketch(
			[
				{
					points: [
						[0, 0],
						[20, 6],
						[4, 14],
					],
					segments: [0.6, 'line', 'line'],
				},
			],
			2,
		);
		const flipped = flipNodes(d, ['s'], 'x');
		rel(volume(evaluateGroup(M, flipped, 's')), volume(evaluateGroup(M, d, 's')), 1e-6);
		const [a, b] = [bounds(evaluateGroup(M, d, 's')!), bounds(evaluateGroup(M, flipped, 's')!)];
		expect(b.min[0]).toBeCloseTo(-a.max[0]!, 4);
		expect(b.max[0]).toBeCloseTo(-a.min[0]!, 4);
	});

	it('is a smooth blob for a spline: it passes through its points, is bigger than the polygon of them, and has no holes', () => {
		const pts: [number, number][] = [
			[0, 0],
			[30, 0],
			[30, 30],
			[0, 30],
		];
		const smooth = sketch([{ points: pts, segments: ['curve', 'curve', 'curve', 'curve'] }], 5);
		const polygon = sketch([{ points: pts }], 5);
		const [vs, vp] = [volume(evaluateGroup(M, smooth, 's')), volume(evaluateGroup(M, polygon, 's'))];
		expect(vs).toBeGreaterThan(vp);
		expect(vs).toBeLessThan(vp * 1.5); // a smooth curve through the corners of a square rounds out past its sides
	});

	it('is part of the cache key: bending a side changes the shape', () => {
		const flat = sketch(
			[
				{
					points: [
						[0, 0],
						[20, 0],
						[10, 15],
					],
				},
			],
			3,
		);
		const bent = sketch(
			[
				{
					points: [
						[0, 0],
						[20, 0],
						[10, 15],
					],
					segments: [0.5, 'line', 'line'],
				},
			],
			3,
		);
		expect(subtreeHash(flat, 's')).not.toBe(subtreeHash(bent, 's'));
	});
});
