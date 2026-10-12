import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design } from './design.ts';
import { setNodeEuler, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { canResizeGroup, groupGeometry, groupLocalCentre, groupRings, setGroupGeometry, setGroupRotation } from './groupTransform.ts';
import { addShape, nodeBoundsIn, shapeBounds } from './ops.ts';
import { eulerToMatrix, rotationOfTransform } from './rotation.ts';

const close = (a: readonly number[], b: readonly number[], digits = 6) => {
	for (const [i, v] of a.entries()) expect(v).toBeCloseTo(b[i]!, digits);
};

/** Two 20 mm boxes, one at x = 0 and one at x = 60, grouped: the group spans x -10..70, y -10..10, z 0..20. */
function pair(): { d: Design; g: string } {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [60, 0], { id: 'b' }).design;
	const g = groupNodes(d, ['a', 'b'], { id: 'g' });
	return { d: g.design, g: g.id! };
}

const Z90 = eulerToMatrix([0, 0, 90]);
const centreOf = (d: Design, g: string) => {
	const b = nodeBoundsIn(d, g)!;
	return [0, 1, 2].map((k) => (b.min[k]! + b.max[k]!) / 2);
};

describe('groupLocalCentre', () => {
	it('is the middle of what the group holds, in the group’s own frame', () => {
		const { d, g } = pair();
		close(groupLocalCentre(d, g)!, [30, 0, 10]);
	});

	it('does not depend on where the group has been moved or turned to', () => {
		const { d, g } = pair();
		const turned = setGroupRotation(d, g, Z90)!;
		close(groupLocalCentre(turned, g)!, [30, 0, 10]);
	});

	it('is null for something that is not a group, or an empty or hidden one', () => {
		const { d } = pair();
		expect(groupLocalCentre(d, 'a')).toBeNull();
		expect(groupLocalCentre(d, 'nope')).toBeNull();
	});
});

describe('setGroupRotation', () => {
	it('turns the group about the middle of its contents', () => {
		const { d, g } = pair();
		const out = setGroupRotation(d, g, Z90);
		close(centreOf(out, g), centreOf(d, g)); // the middle stays put
		const b = nodeBoundsIn(out, g)!; // was 80 long in x and 20 in y; now the other way round
		expect(b.max[0]! - b.min[0]!).toBeCloseTo(20);
		expect(b.max[1]! - b.min[1]!).toBeCloseTo(80);
	});

	it('gives the group the requested orientation, and leaves the children alone', () => {
		const { d, g } = pair();
		const out = setGroupRotation(d, g, Z90);
		close(rotationOfTransform(out.nodes[g]!.transform), Z90);
		expect(out.nodes.a).toBe(d.nodes.a);
		expect(out.nodes.b).toBe(d.nodes.b);
	});

	it('turning back restores the original position', () => {
		const { d, g } = pair();
		const there = setGroupRotation(d, g, Z90);
		const back = setGroupRotation(there, g, eulerToMatrix([0, 0, 0]));
		close(back.nodes[g]!.transform, d.nodes[g]!.transform);
	});

	it('keeps the same pivot through a second turn', () => {
		const { d, g } = pair();
		const a = setGroupRotation(d, g, eulerToMatrix([0, 0, 90]));
		const b = setGroupRotation(a, g, eulerToMatrix([0, 0, 180]));
		close(centreOf(b, g), centreOf(d, g));
	});

	it('can tip a group over, and it still rests where it should about its middle', () => {
		const { d, g } = pair();
		const out = setGroupRotation(d, g, eulerToMatrix([90, 0, 0]));
		close(centreOf(out, g), centreOf(d, g));
	});

	it('does nothing for a locked group, a missing node, a shape, bad numbers, or the same orientation', () => {
		const { d, g } = pair();
		const locked = { ...d, nodes: { ...d.nodes, [g]: { ...d.nodes[g]!, locked: true } } };
		expect(setGroupRotation(locked, g, Z90)).toBe(locked);
		expect(setGroupRotation(d, 'nope', Z90)).toBe(d);
		expect(setGroupRotation(d, 'a', Z90)).toBe(d);
		expect(setGroupRotation(d, g, [1, 0, 0])).toBe(d);
		expect(setGroupRotation(d, g, [Number.NaN, 0, 0, 0, 1, 0, 0, 0, 1])).toBe(d);
		expect(setGroupRotation(d, g, eulerToMatrix([0, 0, 0]))).toBe(d);
	});

	it('works for a group that is not at the origin or has resized shapes', () => {
		let { d } = pair();
		d = setShapeSize(d, 'b', { width: 40, depth: 10, height: 30 });
		const out = setGroupRotation(d, 'g', Z90);
		close(centreOf(out, 'g'), centreOf(d, 'g'));
	});
});

describe('groupRings', () => {
	it('puts the rings on the middle of the group, just outside it, with the group\u2019s orientation', () => {
		const { d, g } = pair();
		const r = groupRings(d, g)!;
		close(r.center, [30, 0, 10]);
		expect(r.radius).toBeGreaterThan(Math.hypot(80, 20, 20) / 2);
		close(r.rotation, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
	});

	it('follows the group once it has been turned (the centre stays, the rings turn)', () => {
		const { d, g } = pair();
		const r = groupRings(setGroupRotation(d, g, Z90), g)!;
		close(r.center, [30, 0, 10]);
		close(r.rotation, Z90);
	});

	it('is null for shapes, missing or empty groups', () => {
		const { d } = pair();
		expect(groupRings(d, 'a')).toBeNull();
		expect(groupRings(d, 'nope')).toBeNull();
	});
});

describe('groupGeometry', () => {
	it('is the contents\u2019 box as a shape geometry: base centre, size', () => {
		const { d, g } = pair();
		expect(groupGeometry(d, g)).toEqual({ x: 30, y: 0, z: 0, width: 80, depth: 20, height: 20 });
	});

	it('follows the group when it is moved or turned about z', () => {
		const { d, g } = pair();
		const moved = { ...d, nodes: { ...d.nodes, [g]: { ...d.nodes[g]!, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 7, 3, 1] } } };
		expect(groupGeometry(moved, g)).toEqual({ x: 35, y: 7, z: 3, width: 80, depth: 20, height: 20 });
		const turned = setGroupRotation(d, g, Z90);
		const geo = groupGeometry(turned, g)!;
		expect(geo.width).toBeCloseTo(80); // sizes are in the group's own frame
		expect(geo.depth).toBeCloseTo(20);
		expect([geo.x, geo.y]).toEqual([expect.closeTo(30), expect.closeTo(0)]);
	});

	it('is null for a shape, a missing node or a group that is not upright', () => {
		const { d, g } = pair();
		expect(groupGeometry(d, 'a')).toBeNull();
		expect(groupGeometry(d, 'nope')).toBeNull();
		expect(groupGeometry(setGroupRotation(d, g, eulerToMatrix([30, 0, 0])), g)).toBeNull();
	});
});

describe('canResizeGroup', () => {
	it('is true when everything inside is turned in quarter turns, or not turned', () => {
		const { d, g } = pair();
		expect(canResizeGroup(d, g)).toBe(true);
		let turned = setNodeEuler(d, 'a', [0, 0, 90]);
		expect(canResizeGroup(turned, g)).toBe(true);
		turned = setNodeEuler(turned, 'b', [90, 0, 180]);
		expect(canResizeGroup(turned, g)).toBe(true);
	});

	it('is false when a shape inside is turned some other way, or the group is tipped', () => {
		const { d, g } = pair();
		expect(canResizeGroup(setNodeEuler(d, 'a', [0, 0, 45]), g)).toBe(false);
		expect(canResizeGroup(setGroupRotation(d, g, eulerToMatrix([20, 0, 0])), g)).toBe(false);
	});

	it('looks inside nested groups too, and refuses shapes', () => {
		let { d } = pair();
		d = addShape(d, 'box', [200, 0], { id: 'c' }).design;
		d = addShape(d, 'box', [260, 0], { id: 'e' }).design;
		const inner = groupNodes(d, ['c', 'e'], { id: 'inner' });
		const outer = groupNodes(inner.design, ['g', 'inner'], { id: 'outer' });
		expect(canResizeGroup(outer.design, 'outer')).toBe(true);
		expect(canResizeGroup(setNodeEuler(outer.design, 'c', [0, 0, 30]), 'outer')).toBe(false);
		expect(canResizeGroup(outer.design, 'a')).toBe(false);
	});
});

describe('setGroupGeometry', () => {
	const box = (d: Design, id: string) => shapeBounds(d.nodes[id] as never);

	it('stretching the group stretches the shapes and spreads them out', () => {
		const { d, g } = pair(); // 80 wide: a at -10..10, b at 50..70
		const out = setGroupGeometry(d, g, { x: 70, y: 0, z: 0, width: 160, depth: 20, height: 20 }); // twice as wide, left edge kept at -10
		expect(box(out, 'a').min[0]).toBeCloseTo(-10);
		expect(box(out, 'a').max[0]).toBeCloseTo(30); // 20 wide became 40
		expect(box(out, 'b').min[0]).toBeCloseTo(110); // moved out: 50 -> 110
		expect(box(out, 'b').max[0]).toBeCloseTo(150);
		const b = nodeBoundsIn(out, g)!;
		expect([b.min[0], b.max[0]]).toEqual([expect.closeTo(-10), expect.closeTo(150)]);
	});

	it('scales height and depth the same way', () => {
		const { d, g } = pair();
		const out = setGroupGeometry(d, g, { x: 30, y: 0, z: 0, width: 80, depth: 40, height: 60 });
		const b = nodeBoundsIn(out, g)!;
		expect(b.max[1]! - b.min[1]!).toBeCloseTo(40);
		expect(b.max[2]! - b.min[2]!).toBeCloseTo(60);
	});

	it('moving the geometry (a lift or a slide) moves the contents without resizing them', () => {
		const { d, g } = pair();
		const out = setGroupGeometry(d, g, { x: 30, y: 0, z: 15, width: 80, depth: 20, height: 20 });
		expect(box(out, 'a').min[2]).toBeCloseTo(15);
		expect(box(out, 'a').max[2]! - box(out, 'a').min[2]!).toBeCloseTo(20);
	});

	it('swaps the factors for a shape turned a quarter, so it still stretches with the group', () => {
		let { d, g } = pair();
		d = setShapeSize(d, 'a', { width: 20, depth: 10, height: 10 });
		d = setNodeEuler(d, 'a', [0, 0, 90]); // its width now runs along the group's y
		const before = box(d, 'a');
		const geo = groupGeometry(d, g)!;
		const out = setGroupGeometry(d, g, { ...geo, depth: geo.depth * 2 }); // the group's y doubled
		const after = box(out, 'a');
		expect((after.max[1]! - after.min[1]!) / (before.max[1]! - before.min[1]!)).toBeCloseTo(2);
		expect((after.max[0]! - after.min[0]!) / (before.max[0]! - before.min[0]!)).toBeCloseTo(1);
	});

	it('scales through nested groups', () => {
		let { d } = pair();
		d = addShape(d, 'box', [200, 0], { id: 'c' }).design;
		d = addShape(d, 'box', [260, 0], { id: 'e' }).design;
		const inner = groupNodes(d, ['c', 'e'], { id: 'inner' });
		const outer = groupNodes(inner.design, ['g', 'inner'], { id: 'outer' });
		const geo = groupGeometry(outer.design, 'outer')!;
		const out = setGroupGeometry(outer.design, 'outer', { ...geo, width: geo.width * 2 });
		const [bef, aft] = [nodeBoundsIn(outer.design, 'outer')!, nodeBoundsIn(out, 'outer')!];
		expect(aft.max[0]! - aft.min[0]!).toBeCloseTo(2 * (bef.max[0]! - bef.min[0]!));
		expect(box(out, 'e').max[0]! - box(out, 'e').min[0]!).toBeCloseTo(40);
	});

	it('works for a group that has been moved and turned about z', () => {
		const { d, g } = pair();
		const turned = setGroupRotation(d, g, Z90);
		const geo = groupGeometry(turned, g)!;
		const out = setGroupGeometry(turned, g, { ...geo, width: geo.width * 2 });
		const b = nodeBoundsIn(out, g)!; // the group's x now runs along world y
		expect(b.max[1]! - b.min[1]!).toBeCloseTo(160);
		expect(b.max[0]! - b.min[0]!).toBeCloseTo(20);
	});

	it('refuses bad numbers, sizes that are too big or too small, locked groups, and what cannot be scaled exactly', () => {
		const { d, g } = pair();
		const geo = groupGeometry(d, g)!;
		expect(setGroupGeometry(d, g, { ...geo, width: 0 })).toBe(d);
		expect(setGroupGeometry(d, g, { ...geo, width: Number.NaN })).toBe(d);
		expect(setGroupGeometry(d, g, { ...geo, width: 40000 })).toBe(d); // a shape would pass 1000 mm
		expect(setGroupGeometry(d, g, { ...geo, width: 0.01 })).toBe(d); // a shape would shrink below 0.1 mm
		const locked = { ...d, nodes: { ...d.nodes, [g]: { ...d.nodes[g]!, locked: true } } };
		expect(setGroupGeometry(locked, g, { ...geo, width: 100 })).toBe(locked);
		const skewed = setNodeEuler(d, 'a', [0, 0, 45]);
		expect(setGroupGeometry(skewed, g, { ...geo, width: 100 })).toBe(skewed);
		expect(setGroupGeometry(d, 'a', geo)).toBe(d);
	});

	it('returns the same design when nothing changes', () => {
		const { d, g } = pair();
		expect(setGroupGeometry(d, g, groupGeometry(d, g)!)).toBe(d);
	});

	it('does not go below the workplane when lifted negatively', () => {
		const { d, g } = pair();
		expect(setGroupGeometry(d, g, { ...groupGeometry(d, g)!, z: -5 })).toBe(d);
	});
});
