import { addShape, createEmptyDesign, renameDesign } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { hasExportableShapes, onlySelected } from './exportDesign.ts';

const two = () => {
	let d = renameDesign(createEmptyDesign('d', 'x'), 'Bracket');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
	return d;
};

describe('onlySelected', () => {
	it('keeps only the selected top-level things, in design order', () => {
		expect(onlySelected(two(), ['b']).roots).toEqual(['b']);
		expect(onlySelected(two(), ['b', 'a']).roots).toEqual(['a', 'b']);
	});

	it('ignores ids that are not top-level things in the design', () => {
		expect(onlySelected(two(), ['nope']).roots).toEqual([]);
	});

	it('leaves everything else about the design alone', () => {
		const d = two();
		const selected = onlySelected(d, ['a']);
		expect(selected.name).toBe(d.name);
		expect(selected.nodes).toBe(d.nodes);
	});

	it('is not exportable when the selection is only holes', () => {
		const d = two();
		const withHole = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, mode: 'hole' as const } } };
		expect(hasExportableShapes(onlySelected(withHole, ['b']))).toBe(false);
		expect(hasExportableShapes(onlySelected(withHole, ['a']))).toBe(true);
	});
});
