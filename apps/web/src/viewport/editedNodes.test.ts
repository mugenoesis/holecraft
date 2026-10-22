import { addShape, createEmptyDesign } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { editedNodeIds, withoutNodes } from './editedNodes.ts';

const design = () => addShape(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design, 'sphere', [40, 0], { id: 'b' }).design;

describe('editedNodeIds', () => {
	it('is the sketch while the Sketch tool is on, and the engraving while the Engrave tool is on', () => {
		expect(editedNodeIds('sketch', 's', { group: 'g', node: 'e' })).toEqual(['s']);
		expect(editedNodeIds('engrave', 's', { group: 'g', node: 'e' })).toEqual(['e']);
	});

	it('is nothing for another tool, or when nothing is being edited', () => {
		expect(editedNodeIds('ruler', 's', { group: 'g', node: 'e' })).toEqual([]);
		expect(editedNodeIds(null, 's', null)).toEqual([]);
		expect(editedNodeIds('sketch', null, null)).toEqual([]);
		expect(editedNodeIds('engrave', null, null)).toEqual([]);
	});
});

describe('withoutNodes', () => {
	it('hides the nodes asked for, and leaves the rest', () => {
		const out = withoutNodes(design(), ['a']);
		expect(out.nodes.a?.hidden).toBe(true);
		expect(out.nodes.b?.hidden).toBe(false);
	});

	it('gives the same design back when there is nothing to hide, or the ids are not in it', () => {
		const d = design();
		expect(withoutNodes(d, [])).toBe(d);
		expect(withoutNodes(d, ['nope'])).toBe(d);
	});
});
