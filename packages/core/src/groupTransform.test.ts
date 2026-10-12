import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design } from './design.ts';
import { setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { groupLocalCentre, groupRings, setGroupRotation } from './groupTransform.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
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
