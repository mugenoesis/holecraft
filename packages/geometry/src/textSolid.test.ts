import {
	addShape,
	createEmptyDesign,
	type Design,
	groupNodes,
	setNodeMode,
	setShapeParam,
	setShapeSize,
	setShapeText,
	textOutlines,
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

const volume = (m: GroupMesh | null) => {
	if (!m) return 0;
	let sum = 0;
	for (let i = 0; i < m.indices.length; i += 3) {
		const [a, b, c] = [m.indices[i]! * 3, m.indices[i + 1]! * 3, m.indices[i + 2]! * 3];
		const p = m.positions;
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
const shoelace = (poly: readonly (readonly [number, number])[]) =>
	poly.reduce((sum, [x, y], i) => sum + (x * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * y), 0) / 2;

/** A text shape saying `words` in `font`. */
function text(words: string, font = 1): Design {
	let d = addShape(createEmptyDesign('d'), 'text', [0, 0], { id: 't' }).design;
	d = setShapeText(d, 't', words);
	return font === 1 ? d : setShapeParam(d, 't', 'font', font);
}
const node = (d: Design) => d.nodes.t as unknown as { params: { width: number; depth: number; height: number } };

describe('a Text shape in the CSG engine', () => {
	it('is the letters stretched to fill its box and extruded: an H’s volume is its outline’s area, scaled to the box, times the thickness', () => {
		const d = text('H');
		const { width, depth, height } = node(d).params;
		const outline = textOutlines('H', 1)!;
		const inkArea = Math.abs(shoelace(outline.polygons[0]!));
		const [inkW, inkD] = [outline.box.max[0] - outline.box.min[0], outline.box.max[1] - outline.box.min[1]];
		const expected = inkArea * (width / inkW) * (depth / inkD) * height;
		expect(volume(evaluateNode(M, d, 't'))).toBeCloseTo(expected, 3);
	});

	it('fills its box exactly: x and y within half the width and depth, z from 0 to the thickness', () => {
		const d = text('Hi there');
		const { width, depth, height } = node(d).params;
		const b = bounds(evaluateNode(M, d, 't')!);
		expect(b.min[0]).toBeCloseTo(-width / 2, 4);
		expect(b.max[0]).toBeCloseTo(width / 2, 4);
		expect(b.min[1]).toBeCloseTo(-depth / 2, 4);
		expect(b.max[1]).toBeCloseTo(depth / 2, 4);
		expect([b.min[2], b.max[2]]).toEqual([0, height]);
	});

	it('leaves the holes of letters open: an o is a ring', () => {
		const d = text('o');
		const { width, depth, height } = node(d).params;
		const outline = textOutlines('o', 1)!;
		const [a, b] = outline.polygons.map(shoelace) as [number, number];
		const ring = Math.abs(a + b);
		const [inkW, inkD] = [outline.box.max[0] - outline.box.min[0], outline.box.max[1] - outline.box.min[1]];
		expect(volume(evaluateNode(M, d, 't'))).toBeCloseTo(ring * (width / inkW) * (depth / inkD) * height, 3);
	});

	it('stretches evenly when its box is: twice as wide is twice the volume, and a thicker one is thicker', () => {
		const d = text('Hello');
		const base = volume(evaluateNode(M, d, 't'));
		const wide = setShapeSize(d, 't', { width: node(d).params.width * 2 });
		expect(volume(evaluateNode(M, wide, 't'))).toBeCloseTo(base * 2, 2);
		const thick = setShapeSize(d, 't', { height: 6 });
		expect(volume(evaluateNode(M, thick, 't'))).toBeCloseTo(base * 2, 2);
	});

	it('is a different shape in a different font, with a different amount of material', () => {
		expect(volume(evaluateNode(M, text('Hello', 1), 't'))).not.toBeCloseTo(volume(evaluateNode(M, text('Hello', 3), 't')), 0);
	});

	it('is worked out on its own as a top-level shape (so the view draws the letters, not a box)', () => {
		const d = text('Hi');
		expect(rootComputedNodes(d)).toEqual(['t']);
		expect(volume(evaluateGroup(M, d, 't'))).toBeGreaterThan(0);
	});

	it('cuts as a hole: a block with a word cut out of it loses exactly the word', () => {
		let d = addShape(text('Hi'), 'box', [0, 0], { id: 'b' }).design;
		d = setShapeSize(d, 'b', { width: 60, depth: 40, height: 3 });
		const word = volume(evaluateNode(M, d, 't'));
		d = setNodeMode(d, ['t'], 'hole');
		const g = groupNodes(d, ['b', 't'], { id: 'g' }).design;
		expect(volume(evaluateGroup(M, g, 'g'))).toBeCloseTo(60 * 40 * 3 - word, 2);
	});

	it('keeps its letters if the words are missing from a damaged file: it says Text', () => {
		const d = text('Hi');
		const damaged = { ...d, nodes: { ...d.nodes, t: { ...d.nodes.t!, params: { width: 20, depth: 8, height: 3 } } } } as Design;
		expect(volume(evaluateNode(M, damaged, 't'))).toBeGreaterThan(0);
	});

	it('is part of the cache key: other words or another font never reuse the old letters', () => {
		const hash = (d: Design) => subtreeHash(d, 't');
		expect(hash(text('Hi'))).toBe(hash(text('Hi')));
		expect(hash(text('Hi'))).not.toBe(hash(text('Ho')));
		expect(hash(text('Hi', 1))).not.toBe(hash(text('Hi', 2)));
	});

	it('is exported as a body named and coloured like the shape, with the volume of its letters; as a hole it is left out', () => {
		const d = text('Hi');
		const bodies = collectBodies(M, d);
		expect(bodies.map((b) => b.name)).toEqual(['Text 1']);
		expect(volume(bodies[0]!.mesh)).toBeCloseTo(volume(evaluateNode(M, d, 't')), 6);
		expect(collectBodies(M, setNodeMode(d, ['t'], 'hole'))).toEqual([]);
	});

	it('is exported where it stands: moved up and along, its letters keep their size', () => {
		const d = text('Hi');
		const moved = {
			...d,
			nodes: { ...d.nodes, t: { ...d.nodes.t!, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 40, 0, 5, 1] } },
		} as Design;
		const [body] = collectBodies(M, moved);
		const b = bounds(body!.mesh);
		expect(b.min[2]).toBeCloseTo(5, 6);
		expect(b.max[2]).toBeCloseTo(8, 6);
		expect((b.min[0]! + b.max[0]!) / 2).toBeCloseTo(40, 6);
		expect(volume(body!.mesh)).toBeCloseTo(volume(evaluateNode(M, d, 't')), 3); // float32 positions, 40 mm out
	});
});
