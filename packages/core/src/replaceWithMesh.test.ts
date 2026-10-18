import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type ShapeNode } from './design.ts';
import { setNodeColor, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { MESH_SHAPE_TYPE, type MeshShapeInput } from './meshShape.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
import { canReplaceWithMesh, replaceWithMesh } from './replaceWithMesh.ts';
import { tiltNode } from './resinTilt.ts';

const REF = 'a'.repeat(64);

/** Three 20 mm boxes: 'b' at (30, -10), 'x' and 'y' elsewhere, so the order of the roots can be seen. */
function design(): Design {
	let d = createEmptyDesign('t');
	d = addShape(d, 'box', [0, 0], { id: 'x' }).design;
	d = addShape(d, 'box', [30, -10], { id: 'b' }).design;
	d = addShape(d, 'box', [80, 0], { id: 'y' }).design;
	return setShapeSize(d, 'b', { width: 20, depth: 20, height: 20 });
}

const inputFor = (d: Design, id: string, name = 'Box 1 hollow'): MeshShapeInput => {
	const b = nodeBoundsIn(d, id)!;
	return { name, ref: REF, size: [b.max[0]! - b.min[0]!, b.max[1]! - b.min[1]!, b.max[2]! - b.min[2]!] };
};

describe('replaceWithMesh', () => {
	it('puts an imported mesh shape where the shape was, the same size and place, in the same order', () => {
		const d = design();
		const out = replaceWithMesh(d, 'b', inputFor(d, 'b'), { id: 'm' });
		expect(out.id).toBe('m');
		expect(out.design.roots).toEqual(['x', 'm', 'y']);
		expect(out.design.nodes.b).toBeUndefined();
		const node = out.design.nodes.m as ShapeNode;
		expect(node.shapeType).toBe(MESH_SHAPE_TYPE);
		expect(node.name).toBe('Box 1 hollow');
		expect(node.params.mesh).toBe(REF);
		const before = nodeBoundsIn(d, 'b')!;
		const after = nodeBoundsIn(out.design, 'm')!;
		for (const k of [0, 1, 2]) {
			expect(after.min[k]).toBeCloseTo(before.min[k]!);
			expect(after.max[k]).toBeCloseTo(before.max[k]!);
		}
	});

	it('keeps the place of a raised, tilted shape (its bounds are what are kept)', () => {
		const tilted = tiltNode(design(), 'b', 30);
		const out = replaceWithMesh(tilted, 'b', inputFor(tilted, 'b'), { id: 'm' });
		const before = nodeBoundsIn(tilted, 'b')!;
		const after = nodeBoundsIn(out.design, 'm')!;
		for (const k of [0, 1, 2]) {
			expect(after.min[k]).toBeCloseTo(before.min[k]!);
			expect(after.max[k]).toBeCloseTo(before.max[k]!);
		}
		expect(after.min[2]).toBeCloseTo(0);
	});

	it('takes the colour of the shape it replaces', () => {
		const coloured = setNodeColor(design(), ['b'], '#112233');
		const out = replaceWithMesh(coloured, 'b', inputFor(coloured, 'b'), { id: 'm' });
		expect(out.design.nodes.m!.color).toBe('#112233');
	});

	it('replaces a group, with everything in it', () => {
		const d = design();
		const made = groupNodes(d, ['x', 'b'], { id: 'g' });
		const out = replaceWithMesh(made.design, 'g', inputFor(made.design, 'g', 'Group 1 hollow'), { id: 'm' });
		expect(out.design.roots).toEqual(['m', 'y']);
		expect(Object.keys(out.design.nodes).sort()).toEqual(['m', 'y']);
	});

	it('leaves the design alone for what cannot be replaced', () => {
		const d = design();
		expect(canReplaceWithMesh(d, 'b')).toBe(true);
		expect(canReplaceWithMesh(d, 'nope')).toBe(false);
		expect(replaceWithMesh(d, 'nope', inputFor(d, 'b')).design).toBe(d);
		const locked = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, locked: true } } };
		expect(canReplaceWithMesh(locked, 'b')).toBe(false);
		expect(replaceWithMesh(locked, 'b', inputFor(d, 'b')).design).toBe(locked);
		const hidden = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, hidden: true } } };
		expect(canReplaceWithMesh(hidden, 'b')).toBe(false);
	});
});
