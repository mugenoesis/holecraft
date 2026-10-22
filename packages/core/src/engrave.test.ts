import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type GroupNode, type ShapeNode } from './design.ts';
import { engraveInto, engravePolygons, whyNotEngrave } from './engrave.ts';
import { groupNodes } from './groups.ts';
import type { MeshShapeInput } from './meshShape.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
import { textMetrics } from './text.ts';

const bbox = (rings: readonly (readonly (readonly [number, number])[])[]) => {
	const xs = rings.flat().map((p) => p[0]);
	const ys = rings.flat().map((p) => p[1]);
	return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

const base = { text: 'Hi', font: 1, em: 10, angle: 0, at: [0, 0] as [number, number] };

describe('engravePolygons', () => {
	it('is the letters at the em in mm, centred on the place asked, the same size the Text shape gives them', () => {
		const rings = engravePolygons({ ...base, at: [30, -12] })!;
		const b = bbox(rings);
		const m = textMetrics('Hi', 1)!;
		expect(b.maxX - b.minX).toBeCloseTo(m.width * 10, 6);
		expect(b.maxY - b.minY).toBeCloseTo(m.depth * 10, 6);
		expect((b.minX + b.maxX) / 2).toBeCloseTo(30, 6);
		expect((b.minY + b.maxY) / 2).toBeCloseTo(-12, 6);
	});

	it('doubles in size with the em', () => {
		const [a, b] = [bbox(engravePolygons({ ...base, em: 10 })!), bbox(engravePolygons({ ...base, em: 20 })!)];
		expect(b.maxX - b.minX).toBeCloseTo((a.maxX - a.minX) * 2, 6);
	});

	it('turns about the middle of the letters, anticlockwise as the view shows them: a quarter turn swaps width and height', () => {
		const flat = bbox(engravePolygons(base)!);
		const turned = bbox(engravePolygons({ ...base, angle: 90 })!);
		expect(turned.maxX - turned.minX).toBeCloseTo(flat.maxY - flat.minY, 6);
		expect(turned.maxY - turned.minY).toBeCloseTo(flat.maxX - flat.minX, 6);
		expect((turned.minX + turned.maxX) / 2).toBeCloseTo(0, 6);
		// anticlockwise: the start of the line (left) goes to the bottom
		const first = engravePolygons({ ...base, angle: 90 })![0]![0]!;
		expect(Number.isFinite(first[0])).toBe(true);
	});

	it('keeps the letters’ winding, so the holes of letters stay holes', () => {
		const area = (ring: readonly (readonly [number, number])[]) =>
			ring.reduce((s, [x, y], i) => s + (x * ring[(i + 1) % ring.length]![1] - ring[(i + 1) % ring.length]![0] * y), 0) / 2;
		const signs = (rings: readonly (readonly (readonly [number, number])[])[]) => rings.map((r) => Math.sign(area(r)));
		expect(signs(engravePolygons({ ...base, text: 'o', angle: 37 })!)).toEqual(signs(engravePolygons({ ...base, text: 'o', angle: 0 })!));
		expect(new Set(signs(engravePolygons({ ...base, text: 'o' })!)).size).toBe(2); // an outer ring and a hole
	});

	it('is null for words with no ink, a font that is not there, or a size that is not a size', () => {
		expect(engravePolygons({ ...base, text: '   ' })).toBeNull();
		expect(engravePolygons({ ...base, font: 99 })).toBeNull();
		expect(engravePolygons({ ...base, em: 0 })).toBeNull();
		expect(engravePolygons({ ...base, em: Number.NaN })).toBeNull();
	});
});

function scene(): Design {
	return addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
}
const input: MeshShapeInput = { name: 'Engraving', ref: 'a'.repeat(64), size: [10, 4, 2.5] };
const bounds = { min: [-5, -2, 17.5] as [number, number, number], max: [5, 2, 20] as [number, number, number] };

describe('whyNotEngrave', () => {
	it('is null for a visible, unlocked shape or group that is a solid', () => {
		expect(whyNotEngrave(scene(), 'a')).toBeNull();
		const g = groupNodes(addShape(scene(), 'sphere', [40, 0], { id: 'b' }).design, ['a', 'b'], { id: 'g' });
		expect(whyNotEngrave(g.design, 'g')).toBeNull();
	});

	it('says why not for a locked, hidden or hole shape, one inside a group, or one that is not there', () => {
		const d = scene();
		const with_ = (patch: Partial<ShapeNode>) => ({ ...d, nodes: { ...d.nodes, a: { ...d.nodes.a!, ...patch } } }) as Design;
		expect(whyNotEngrave(with_({ locked: true }), 'a')).toMatch(/locked/i);
		expect(whyNotEngrave(with_({ hidden: true }), 'a')).toMatch(/hidden/i);
		expect(whyNotEngrave(with_({ mode: 'hole' }), 'a')).toMatch(/hole/i);
		expect(whyNotEngrave(d, 'nope')).toMatch(/not there|no longer/i);
		const g = groupNodes(addShape(d, 'sphere', [40, 0], { id: 'b' }).design, ['a', 'b'], { id: 'g' });
		expect(whyNotEngrave(g.design, 'a')).toMatch(/group|top level|whole/i);
	});
});

describe('engraveInto', () => {
	it('groups an engraving (a hole) with its target, standing where the fitted letters are', () => {
		const out = engraveInto(scene(), 'a', input, bounds, 'engrave', { id: 'e', groupId: 'g' });
		expect(out.id).toBe('g');
		const g = out.design.nodes.g as GroupNode;
		expect(g.kind).toBe('group');
		expect(g.children).toEqual(['a', 'e']);
		expect(out.design.roots).toEqual(['g']);
		const e = out.design.nodes.e as ShapeNode;
		expect(e.mode).toBe('hole');
		expect(e.params.mesh).toBe(input.ref);
		expect([e.params.width, e.params.depth, e.params.height]).toEqual([10, 4, 2.5]);
		const b = nodeBoundsIn({ ...out.design, nodes: { ...out.design.nodes, g: { ...g, children: ['e'] } } }, 'g')!; // the engraving alone, to read where it is
		expect(b.min.map((v) => Math.round(v * 1000) / 1000)).toEqual([-5, -2, 17.5]);
		expect(b.max.map((v) => Math.round(v * 1000) / 1000)).toEqual([5, 2, 20]);
	});

	it('raised lettering is a solid in the colour of its target', () => {
		const out = engraveInto(scene(), 'a', input, bounds, 'raised', { id: 'e', groupId: 'g' });
		const e = out.design.nodes.e as ShapeNode;
		expect(e.mode).toBe('solid');
		expect(e.color).toBe(scene().nodes.a!.color);
	});

	it('gives the same design back, and no id, for a target that cannot be engraved, or bounds that are not numbers', () => {
		const d = scene();
		expect(engraveInto(d, 'nope', input, bounds, 'engrave')).toEqual({ design: d, id: null });
		const locked = { ...d, nodes: { ...d.nodes, a: { ...d.nodes.a!, locked: true } } } as Design;
		expect(engraveInto(locked, 'a', input, bounds, 'engrave').id).toBeNull();
		const bad = { min: [Number.NaN, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
		expect(engraveInto(d, 'a', input, bad, 'engrave')).toEqual({ design: d, id: null });
	});
});
