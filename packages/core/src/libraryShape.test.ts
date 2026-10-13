import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type ShapeNode } from './design.ts';
import { setNodeColor, setNodeMode, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { addLibraryShape, libraryColor, libraryShapeOf } from './libraryShape.ts';
import { addMeshShape } from './meshShape.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
import { parseDesign } from './validate.ts';
import { setHidden } from './visibility.ts';

/** A bracket: a box with a cylinder hole through it and a bolt beside it, grouped, standing at (30, 40). */
function bracket(): { design: Design; id: string } {
	let d = addShape(createEmptyDesign('d'), 'box', [30, 40], { id: 'a' }).design;
	d = setShapeSize(d, 'a', { width: 40, depth: 20, height: 10 });
	d = addShape(d, 'cylinder', [30, 40], { id: 'h' }).design;
	d = setShapeSize(d, 'h', { width: 6, depth: 6, height: 10 });
	d = setNodeMode(d, ['h'], 'hole');
	d = setNodeColor(d, ['a'], '#336699');
	const grouped = groupNodes(d, ['a', 'h'], { id: 'g' });
	return { design: grouped.design, id: 'g' };
}
const world = (d: Design, id: string) => nodeBoundsIn(d, id)!;

describe('libraryShapeOf', () => {
	it('copies a group and everything in it into a small design of its own, standing at the origin', () => {
		const { design, id } = bracket();
		const saved = libraryShapeOf(design, id, 'My bracket')!;
		expect(saved.name).toBe('My bracket');
		expect(saved.roots).toEqual([id]);
		expect(saved.nodes[id]!.name).toBe('My bracket'); // the thing saved is named as the library entry is
		expect(Object.keys(saved.nodes).sort()).toEqual(['a', 'g', 'h']);
		const at = nodeBoundsIn(saved, id)!; // the group was standing at (30, 40): its footprint is now centred on the origin
		expect([(at.min[0] + at.max[0]) / 2, (at.min[1] + at.max[1]) / 2, at.min[2]]).toEqual([0, 0, 0]);
		expect((saved.nodes.h as ShapeNode).mode).toBe('hole');
		expect((saved.nodes.a as ShapeNode).color).toBe('#336699');
		expect(parseDesign(JSON.parse(JSON.stringify(saved)))).toBeTruthy(); // it is a design the server will accept
	});

	it('copies a single shape, keeps how it is turned, and is a copy: the design it came from is not changed', () => {
		const d = addShape(createEmptyDesign('d'), 'cone', [50, 50], { id: 's' }).design;
		const before = JSON.stringify(d);
		const saved = libraryShapeOf(d, 's', 'Cone')!;
		expect(saved.nodes.s!.transform.slice(12, 15)).toEqual([0, 0, 0]); // a shape's origin is already the middle of its base
		expect(JSON.stringify(d)).toBe(before);
		(saved.nodes.s as ShapeNode).params.width = 999;
		expect((d.nodes.s as ShapeNode).params.width).toBe(20);
	});

	it('is nothing for a node that is not there, and clears a lock or hide on the thing saved (it is a new, usable object)', () => {
		const { design, id } = bracket();
		expect(libraryShapeOf(design, 'nope', 'x')).toBeNull();
		const hidden = setHidden(design, [id], true);
		expect(libraryShapeOf(hidden, id, 'x')!.nodes[id]!.hidden).toBe(false);
	});

	it('keeps an imported model’s reference to its stored mesh', () => {
		const d = addMeshShape(createEmptyDesign('d'), { name: 'Part', ref: 'a'.repeat(64), size: [10, 20, 30] }, { id: 'm' }).design;
		expect((libraryShapeOf(d, 'm', 'Part')!.nodes.m as ShapeNode).params.mesh).toBe('a'.repeat(64));
	});
});

describe('libraryColor', () => {
	it('is the colour of the saved shape, or of the first shape in a group', () => {
		const { design, id } = bracket();
		expect(libraryColor(libraryShapeOf(design, id, 'x')!)).toBe('#336699');
		const d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		expect(libraryColor(libraryShapeOf(d, 'b', 'x')!)).toMatch(/^#[0-9a-f]{6}$/);
	});
});

describe('addLibraryShape', () => {
	it('puts a new copy in a design, on the floor at the place asked, with its own ids, named as saved', () => {
		const saved = libraryShapeOf(bracket().design, 'g', 'My bracket')!;
		const target = addShape(createEmptyDesign('t'), 'sphere', [0, 0], { id: 's' }).design;
		const { design, id } = addLibraryShape(target, saved, { at: [100, -20] });
		expect(id).not.toBeNull();
		expect(design.roots).toEqual(['s', id]);
		expect(design.nodes[id!]!.name).toBe('My bracket');
		expect(Object.keys(design.nodes)).toHaveLength(1 + 3); // the sphere and the three copied
		expect(Object.keys(design.nodes)).not.toContain('a'); // fresh ids: nothing clashes with where it came from
		const b = world(design, id!);
		expect([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]).toEqual([100, -20]);
		expect(b.min[2]).toBe(0);
	});

	it('keeps what is inside: the hole still cuts, the colour and sizes are as saved, and the children belong to the new group', () => {
		const saved = libraryShapeOf(bracket().design, 'g', 'x')!;
		const { design, id } = addLibraryShape(createEmptyDesign('t'), saved, { at: [0, 0] });
		const group = design.nodes[id!]!;
		if (group.kind !== 'group') throw new Error('expected a group');
		const kids = group.children.map((c) => design.nodes[c] as ShapeNode);
		expect(kids.map((k) => k.mode).sort()).toEqual(['hole', 'solid']);
		expect(kids.find((k) => k.mode === 'solid')!.color).toBe('#336699');
		expect(kids.find((k) => k.mode === 'solid')!.params).toMatchObject({ width: 40, depth: 20, height: 10 });
		expect(parseDesign(JSON.parse(JSON.stringify(design)))).toBeTruthy();
	});

	it('can be added again and again: every copy has its own ids', () => {
		const saved = libraryShapeOf(bracket().design, 'g', 'x')!;
		let d = createEmptyDesign('t');
		for (let i = 0; i < 3; i++) d = addLibraryShape(d, saved, { at: [i * 50, 0] }).design;
		expect(d.roots).toHaveLength(3);
		expect(Object.keys(d.nodes)).toHaveLength(9);
	});

	it('stands on a plane when one is given, the way a new shape does (here a wall at x = 0)', () => {
		const saved = libraryShapeOf(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design, 'b', 'Box')!;
		const wall = { origin: [0, 0, 10] as [number, number, number], normal: [1, 0, 0] as [number, number, number] };
		const { design, id } = addLibraryShape(createEmptyDesign('t'), saved, { plane: wall, point: [0, 5, 10] });
		const b = world(design, id!);
		expect(b.min[0]).toBeCloseTo(0, 6); // its base on the wall
		expect(b.max[0]).toBeCloseTo(20, 6); // and 20 mm out of it
	});

	it('refuses a saved shape that has no single root', () => {
		const empty = createEmptyDesign('e');
		const { design, id } = addLibraryShape(createEmptyDesign('t'), empty, { at: [0, 0] });
		expect(id).toBeNull();
		expect(design.roots).toEqual([]);
	});
});
