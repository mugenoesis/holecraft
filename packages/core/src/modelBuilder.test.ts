import { describe, expect, it } from 'vitest';
import { chamferOf } from './chamfer.ts';
import type { GroupNode, ShapeNode } from './design.ts';
import { ModelBuildError, ModelBuilder } from './modelBuilder.ts';
import { nodeBoundsIn } from './ops.ts';
import { shapeParamMm } from './parametricShapes.ts';

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('ModelBuilder', () => {
	it('starts as an empty design with the given name and a valid id', () => {
		const m = new ModelBuilder('Phone case');
		expect(m.design.name).toBe('Phone case');
		expect(m.design.roots).toEqual([]);
		expect(m.design.id).toMatch(/^[0-9a-f]{32}$/);
	});

	it('places a box by its size and the middle of its base', () => {
		const m = new ModelBuilder('t');
		const id = m.add({ type: 'box', size: [60, 40, 30], at: [10, -5, 2] });
		const b = nodeBoundsIn(m.design, id)!;
		expect([b.min[0], b.max[0]]).toEqual([expect.closeTo(-20, 5), expect.closeTo(40, 5)]);
		expect([b.min[1], b.max[1]]).toEqual([expect.closeTo(-25, 5), expect.closeTo(15, 5)]);
		expect([b.min[2], b.max[2]]).toEqual([expect.closeTo(2, 5), expect.closeTo(32, 5)]);
		expect(m.design.roots).toEqual([id]);
	});

	it('rests on the workplane when no height is given', () => {
		const m = new ModelBuilder('t');
		const id = m.add({ type: 'cylinder', size: [10, 10, 4] });
		near(nodeBoundsIn(m.design, id)!.min[2], 0);
	});

	it('turns a shape about its centre and then puts its base point at `at`', () => {
		const m = new ModelBuilder('t');
		// 10 x 10 wide, 20 long: lying along -y after a quarter turn about x
		const id = m.add({ type: 'box', size: [10, 10, 20], rotate: [90, 0, 0], at: [0, 0, 5] });
		const b = nodeBoundsIn(m.design, id)!;
		near(b.min[1], -20);
		near(b.max[1], 0);
		near(b.min[2], 0);
		near(b.max[2], 10);
	});

	it('names, colours and makes holes', () => {
		const m = new ModelBuilder('t');
		const id = m.add({ type: 'box', size: [5, 5, 5], name: 'Screw hole', color: '#ff0000', hole: true });
		const node = m.design.nodes[id] as ShapeNode;
		expect(node.name).toBe('Screw hole');
		expect(node.color).toBe('#ff0000');
		expect(node.mode).toBe('hole');
	});

	it('sets a shape’s own settings in mm, and chamfers', () => {
		const m = new ModelBuilder('t');
		const tube = m.add({ type: 'tube', size: [20, 20, 10], params: { wall: 3 } });
		near(shapeParamMm(m.design.nodes[tube] as ShapeNode, 'wall'), 3);
		const box = m.add({ type: 'box', size: [20, 20, 10], params: { chamfer: 1, chamferEdges: 'top' } });
		expect(chamferOf(m.design.nodes[box] as ShapeNode)).toEqual({ size: 1, edges: 'top' });
	});

	it('sets the words of a text shape', () => {
		const m = new ModelBuilder('t');
		const id = m.add({ type: 'text', text: 'Hi' });
		expect((m.design.nodes[id] as ShapeNode).params.text).toBe('Hi');
	});

	it('groups parts so a hole cuts, keeping them where they were', () => {
		const m = new ModelBuilder('t');
		const a = m.add({ type: 'box', size: [20, 20, 20], at: [3, 4, 0] });
		const h = m.add({ type: 'cylinder', size: [5, 5, 30], at: [3, 4, -5], hole: true });
		const g = m.group([a, h], { name: 'Block' });
		expect(m.design.roots).toEqual([g]);
		const group = m.design.nodes[g] as GroupNode;
		expect(group.name).toBe('Block');
		expect(group.children.sort()).toEqual([a, h].sort());
		near(nodeBoundsIn(m.design, g)!.max[2], 20);
	});

	it('can make a whole group a hole', () => {
		const m = new ModelBuilder('t');
		const a = m.add({ type: 'box' });
		const b = m.add({ type: 'box', at: [5, 0] });
		const g = m.group([a, b], { hole: true });
		expect(m.design.nodes[g]?.mode).toBe('hole');
	});

	describe('says so when something is refused, instead of quietly doing nothing', () => {
		it('an unknown shape', () => {
			expect(() => new ModelBuilder('t').add({ type: 'banana' as never })).toThrow(ModelBuildError);
		});
		it('a sketch shape, which needs a drawing the builder cannot give it (the design would be refused on save)', () => {
			expect(() => new ModelBuilder('t').add({ type: 'sketch' })).toThrow(/sketch/i);
		});
		it('a size that is too big or not a number', () => {
			const m = new ModelBuilder('t');
			expect(() => m.add({ type: 'box', size: [5000, 10, 10], name: 'Slab' })).toThrow(/Slab/);
			expect(() => m.add({ type: 'box', size: [Number.NaN, 10, 10] })).toThrow(ModelBuildError);
		});
		it('a setting the shape does not have', () => {
			expect(() => new ModelBuilder('t').add({ type: 'box', params: { wall: 2 } })).toThrow(/wall/);
		});
		it('a setting that was limited to something else, naming what it became', () => {
			// a 10 mm tube cannot have a 9 mm wall
			expect(() => new ModelBuilder('t').add({ type: 'tube', size: [10, 10, 10], params: { wall: 9 } })).toThrow(/limited/);
		});
		it('grouping fewer than two parts, or parts that are not there', () => {
			const m = new ModelBuilder('t');
			const a = m.add({ type: 'box' });
			expect(() => m.group([a])).toThrow(ModelBuildError);
			expect(() => m.group([a, 'nope'])).toThrow(/nope/);
		});
		it('words with nothing to draw', () => {
			expect(() => new ModelBuilder('t').add({ type: 'text', text: '☃' })).toThrow(ModelBuildError);
		});
	});
});
