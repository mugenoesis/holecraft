import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type EdgeTreatment } from './design.ts';
import { removeEdgeTreatments, setEdgeTreatments } from './edgeEdits.ts';
import { addShape } from './ops.ts';

const T = (id: string, size = 2): EdgeTreatment => ({
	id,
	kind: 'chamfer',
	size,
	points: [
		[-10, -10, 20],
		[10, -10, 20],
	],
	normals: [
		[
			[0, 0, 1],
			[0, -1, 0],
		],
	],
});
const start = () => addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;

describe('setEdgeTreatments', () => {
	it('sets the list, and an empty list removes the field', () => {
		const d = setEdgeTreatments(start(), 'a', [T('e1'), T('e2')]);
		expect(d.nodes.a!.edges).toHaveLength(2);
		const cleared = setEdgeTreatments(d, 'a', []);
		expect('edges' in cleared.nodes.a!).toBe(false);
	});

	it('returns the same design when nothing changes', () => {
		const d = setEdgeTreatments(start(), 'a', [T('e1')]);
		expect(setEdgeTreatments(d, 'a', [T('e1')])).toBe(d);
		const plain = start();
		expect(setEdgeTreatments(plain, 'a', [])).toBe(plain);
	});

	it('refuses locked or missing nodes, bad sizes and repeated ids', () => {
		const d = start();
		const locked = { ...d, nodes: { ...d.nodes, a: { ...d.nodes.a!, locked: true } } };
		expect(setEdgeTreatments(locked, 'a', [T('e1')])).toBe(locked);
		expect(setEdgeTreatments(d, 'nope', [T('e1')])).toBe(d);
		expect(setEdgeTreatments(d, 'a', [T('e1', 0)])).toBe(d);
		expect(setEdgeTreatments(d, 'a', [T('e1', Number.NaN)])).toBe(d);
		expect(setEdgeTreatments(d, 'a', [T('e1'), T('e1')])).toBe(d);
	});
});

describe('removeEdgeTreatments', () => {
	it('removes the given ones and keeps the rest', () => {
		const d = setEdgeTreatments(start(), 'a', [T('e1'), T('e2'), T('e3')]);
		expect(removeEdgeTreatments(d, 'a', ['e1', 'e3']).nodes.a!.edges!.map((t) => t.id)).toEqual(['e2']);
	});

	it('removing the last one removes the field, and unknown ids change nothing', () => {
		const d = setEdgeTreatments(start(), 'a', [T('e1')]);
		expect('edges' in removeEdgeTreatments(d, 'a', ['e1']).nodes.a!).toBe(false);
		expect(removeEdgeTreatments(d, 'a', ['zzz'])).toBe(d);
	});
});
