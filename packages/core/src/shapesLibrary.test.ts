import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import { duplicateNodes } from './edit.ts';
import { addShape } from './ops.ts';
import { getShapeDef, isShapeType, SHAPE_DEFS } from './shapes.ts';
import { SOLID_SHAPE_TYPES } from './solidShapes.ts';
import { parseDesign } from './validate.ts';

const NEW = [
	['cone', 'Cone'],
	['pyramid', 'Pyramid'],
	['wedge', 'Wedge'],
	['roof', 'Roof'],
	['round-roof', 'Round Roof'],
	['half-sphere', 'Half Sphere'],
] as const;

describe('the basic shapes', () => {
	it('lists the original three first, then the new ones, each with a name and a 20 mm default size', () => {
		expect(SHAPE_DEFS.map((d) => d.id).slice(0, 3)).toEqual(['box', 'cylinder', 'sphere']);
		for (const [id, name] of NEW) {
			expect(isShapeType(id)).toBe(true);
			expect(getShapeDef(id)).toMatchObject({ name, defaultSize: [20, 20, 20] });
		}
		expect(new Set(SHAPE_DEFS.map((d) => d.id)).size).toBe(SHAPE_DEFS.length);
	});

	it('has a mesh for every shape that is not a box, cylinder or sphere', () => {
		const builtOtherWays = new Set(['box', 'cylinder', 'sphere']);
		expect(
			SHAPE_DEFS.filter((d) => !builtOtherWays.has(d.id))
				.map((d) => d.id)
				.sort(),
		).toEqual([...SOLID_SHAPE_TYPES].sort());
	});

	it('uses only the default palette colours, so each new shape sits in a filament slot', () => {
		const palette = new Set(createEmptyDesign('d').palette);
		for (const def of SHAPE_DEFS) expect(palette.has(def.color)).toBe(true);
	});

	for (const [id, name] of NEW) {
		it(`adds a ${name}, numbers copies of it, and keeps it through saving`, () => {
			let { design } = addShape(createEmptyDesign('d'), id, [0, 0], { id: 'a' });
			expect((design.nodes.a as ShapeNode).name).toBe(`${name} 1`);
			expect((design.nodes.a as ShapeNode).params).toMatchObject({ width: 20, depth: 20, height: 20 });
			design = duplicateNodes(design, ['a'], [10, 10]).design;
			expect(
				Object.values(design.nodes)
					.map((n) => n.name)
					.sort(),
			).toEqual([`${name} 1`, `${name} 2`]);
			expect(parseDesign(JSON.parse(JSON.stringify(design))).roots).toHaveLength(2);
		});
	}
});
