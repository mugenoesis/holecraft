import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import { duplicateNodes } from './edit.ts';
import { addShape } from './ops.ts';
import { PARAMETRIC_TYPES } from './parametricShapes.ts';
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
	['tube', 'Tube'],
	['torus', 'Torus'],
	['hexagon', 'Hexagon'],
	['star', 'Star'],
	['polygon', 'Polygon'],
	['threaded-rod', 'Threaded Rod'],
	['threaded-hole', 'Threaded Hole'],
	['bolt', 'Bolt'],
	['nut', 'Nut'],
	['washer', 'Washer'],
	['standoff', 'Standoff'],
] as const;

/** The default size of the shapes that are not 20 mm each way. */
const SIZE: Record<string, [number, number, number]> = {
	torus: [30, 30, 10],
	hexagon: [20, 17.32, 20],
	star: [20, 19.02, 10],
	polygon: [19.02, 18.09, 20],
	'threaded-rod': [5, 5, 20],
	'threaded-hole': [5.4, 5.4, 10],
	bolt: [9.237604, 8, 23.5],
	nut: [9.237604, 8, 4],
	washer: [10, 10, 1],
	standoff: [9.237604, 8, 10],
};

describe('the basic shapes', () => {
	it('lists the original three first, then the new ones, each with a name and a default size (20 mm each way, except the flatter torus)', () => {
		expect(SHAPE_DEFS.map((d) => d.id).slice(0, 3)).toEqual(['box', 'cylinder', 'sphere']);
		for (const [id, name] of NEW) {
			expect(isShapeType(id)).toBe(true);
			expect(getShapeDef(id)).toMatchObject({ name, defaultSize: SIZE[id] ?? [20, 20, 20] });
		}
		expect(new Set(SHAPE_DEFS.map((d) => d.id)).size).toBe(SHAPE_DEFS.length);
	});

	it('builds every shape that is not a box, cylinder or sphere from a unit mesh (stretched) or from its settings (at its real size), never both', () => {
		const builtOtherWays = new Set(['box', 'cylinder', 'sphere']);
		const others = SHAPE_DEFS.filter((d) => !builtOtherWays.has(d.id)).map((d) => d.id);
		expect([...others].sort()).toEqual([...SOLID_SHAPE_TYPES, ...PARAMETRIC_TYPES].sort());
		expect(SOLID_SHAPE_TYPES.filter((t) => PARAMETRIC_TYPES.includes(t))).toEqual([]);
		for (const def of SHAPE_DEFS) expect(def.params !== undefined).toBe(PARAMETRIC_TYPES.includes(def.id));
	});

	it('uses only the default palette colours, so each new shape sits in a filament slot', () => {
		const palette = new Set(createEmptyDesign('d').palette);
		for (const def of SHAPE_DEFS) expect(palette.has(def.color)).toBe(true);
	});

	for (const [id, name] of NEW) {
		it(`adds a ${name}, numbers copies of it, and keeps it through saving`, () => {
			let { design } = addShape(createEmptyDesign('d'), id, [0, 0], { id: 'a' });
			expect((design.nodes.a as ShapeNode).name).toBe(`${name} 1`);
			const [width, depth, height] = SIZE[id] ?? [20, 20, 20];
			expect((design.nodes.a as ShapeNode).params).toMatchObject({ width, depth, height });
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
