import { describe, expect, it } from 'vitest';
import { createEmptyDesign } from './design.ts';
import { addShape, designBounds, translation, translationOf } from './ops.ts';
import { getShapeDef, isShapeType, SHAPE_DEFS } from './shapes.ts';

describe('shape definitions', () => {
	it('provides the basic shapes with sensible defaults', () => {
		expect(SHAPE_DEFS.map((d) => d.id)).toEqual([
			'box',
			'cylinder',
			'sphere',
			'cone',
			'pyramid',
			'wedge',
			'roof',
			'round-roof',
			'half-sphere',
			'tube',
			'torus',
			'hexagon',
			'star',
			'polygon',
			'threaded-rod',
			'threaded-hole',
			'bolt',
			'nut',
			'washer',
			'standoff',
		]);
		for (const def of SHAPE_DEFS) {
			expect(def.name.length).toBeGreaterThan(0);
			expect(def.defaultSize.every((n) => n > 0)).toBe(true);
		}
	});

	it('recognises shape types', () => {
		expect(isShapeType('box')).toBe(true);
		expect(isShapeType('teapot')).toBe(false);
		expect(getShapeDef('sphere').name).toBe('Sphere');
	});
});

describe('translation helpers', () => {
	it('round-trips a translation through a column-major matrix', () => {
		const m = translation(1, 2, 3);
		expect(m).toHaveLength(16);
		expect(m.slice(12, 15)).toEqual([1, 2, 3]);
		expect(translationOf(m)).toEqual([1, 2, 3]);
	});
});

describe('addShape', () => {
	const base = createEmptyDesign('d1', 'Test', new Date('2026-01-01T00:00:00Z'));

	it('adds a solid shape at the given workplane position, resting on the plane', () => {
		const { design, id } = addShape(base, 'box', [10, -5], { id: 'n1', now: new Date('2026-01-02T00:00:00Z') });
		const node = design.nodes[id];
		expect(design.roots).toEqual(['n1']);
		expect(node).toMatchObject({
			kind: 'shape',
			shapeType: 'box',
			mode: 'solid',
			hidden: false,
			locked: false,
			name: 'Box 1',
		});
		expect(translationOf(node!.transform)).toEqual([10, -5, 0]);
		expect(node && node.kind === 'shape' && node.params).toEqual({ width: 20, depth: 20, height: 20 });
		expect(design.updatedAt).toBe('2026-01-02T00:00:00.000Z');
	});

	it('does not mutate the original design', () => {
		addShape(base, 'box', [0, 0]);
		expect(base.roots).toEqual([]);
		expect(base.nodes).toEqual({});
	});

	it('numbers names per shape type', () => {
		let d = base;
		d = addShape(d, 'box', [0, 0]).design;
		d = addShape(d, 'sphere', [0, 0]).design;
		d = addShape(d, 'box', [0, 0]).design;
		const names = d.roots.map((id) => d.nodes[id]!.name);
		expect(names).toEqual(['Box 1', 'Sphere 1', 'Box 2']);
	});

	it('generates unique ids by default', () => {
		const a = addShape(base, 'box', [0, 0]);
		const b = addShape(a.design, 'box', [0, 0]);
		expect(a.id).not.toBe(b.id);
		expect(b.design.roots).toEqual([a.id, b.id]);
	});
});

describe('designBounds', () => {
	const base = createEmptyDesign('d1');

	it('is null for an empty design', () => {
		expect(designBounds(base)).toBeNull();
	});

	it('covers every shape, centred on its position and resting on z=0', () => {
		let d = addShape(base, 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'cylinder', [50, 30], { id: 'b' }).design;
		expect(designBounds(d)).toEqual({ min: [-10, -10, 0], max: [60, 40, 20] });
	});

	it('ignores hidden shapes', () => {
		const { design } = addShape(base, 'box', [0, 0], { id: 'a' });
		design.nodes.a!.hidden = true;
		expect(designBounds(design)).toBeNull();
	});
});
