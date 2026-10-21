import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type ShapeNode } from './design.ts';
import { setMeshRef } from './edit.ts';
import { addMeshShape } from './meshShape.ts';
import { addShape } from './ops.ts';
import { setLocked } from './visibility.ts';

const OLD = 'a'.repeat(64);
const NEW = 'b'.repeat(64);

function design(): Design {
	let d = createEmptyDesign('t');
	d = addMeshShape(d, { name: 'Part', ref: OLD, size: [10, 20, 30] }, { id: 'm' }).design;
	d = addShape(d, 'box', [50, 0], { id: 'b' }).design;
	return d;
}

describe('setMeshRef', () => {
	it('points an imported model at another stored mesh, keeping everything else about it', () => {
		const d = design();
		const out = setMeshRef(d, 'm', NEW);
		const node = out.nodes.m as ShapeNode;
		expect(node.params.mesh).toBe(NEW);
		expect(node.params).toMatchObject({ width: 10, depth: 20, height: 30 });
		expect(node.name).toBe('Part');
		expect(out.roots).toEqual(d.roots);
	});

	it('leaves the design as it is for the same mesh, a bad name, a shape that is not a model, a locked one, or nothing', () => {
		const d = design();
		expect(setMeshRef(d, 'm', OLD)).toBe(d);
		expect(setMeshRef(d, 'm', 'not-a-ref')).toBe(d);
		expect(setMeshRef(d, 'b', NEW)).toBe(d);
		expect(setMeshRef(d, 'nope', NEW)).toBe(d);
		const locked = setLocked(d, ['m'], true);
		expect(setMeshRef(locked, 'm', NEW)).toBe(locked);
	});
});
