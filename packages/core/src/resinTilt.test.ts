import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design } from './design.ts';
import { setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
import { canTilt, tiltNode, whyNotTilt } from './resinTilt.ts';

/** A 20 mm box at (30, -10), standing on the plane. */
function box(): Design {
	const d = addShape(createEmptyDesign('t'), 'box', [30, -10], { id: 'b' }).design;
	return setShapeSize(d, 'b', { width: 20, depth: 20, height: 20 });
}

const size = (d: Design, id: string) => {
	const b = nodeBoundsIn(d, id)!;
	return { min: b.min, max: b.max, x: b.max[0]! - b.min[0]!, y: b.max[1]! - b.min[1]!, z: b.max[2]! - b.min[2]! };
};

describe('tiltNode', () => {
	it('turns the shape about X by the angle and sets it back on the plane', () => {
		const s = size(tiltNode(box(), 'b', 45), 'b');
		expect(s.min[2]).toBeCloseTo(0); // on the plane
		expect(s.z).toBeCloseTo(20 * Math.SQRT2); // a cube on its edge: 20 (cos 45 + sin 45)
		expect(s.y).toBeCloseTo(20 * Math.SQRT2);
		expect(s.x).toBeCloseTo(20); // X is the axis it turns about
		expect((s.min[0]! + s.max[0]!) / 2).toBeCloseTo(30); // and stays where it was along X
	});

	it('tilts further each time, and a quarter turn lays a box on its side', () => {
		const twice = tiltNode(tiltNode(box(), 'b', 45), 'b', 45);
		const s = size(twice, 'b');
		expect(s.z).toBeCloseTo(20);
		expect(s.y).toBeCloseTo(20);
		expect(s.min[2]).toBeCloseTo(0);
	});

	it('tilts the other way with a negative angle', () => {
		const up = size(tiltNode(box(), 'b', 30), 'b');
		const down = size(tiltNode(box(), 'b', -30), 'b');
		expect(down.z).toBeCloseTo(up.z);
		expect(down.min[2]).toBeCloseTo(0);
		// a cube looks the same either way, but it is turned the other way
		expect(tiltNode(box(), 'b', -30).nodes.b!.transform).not.toEqual(tiltNode(box(), 'b', 30).nodes.b!.transform);
	});

	it('tilts a group as one piece', () => {
		let d = createEmptyDesign('t');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'box', [30, 0], { id: 'c' }).design;
		const grouped = groupNodes(d, ['a', 'c'], { id: 'g' });
		const out = tiltNode(grouped.design, 'g', 30);
		const s = size(out, 'g');
		expect(s.min[2]).toBeCloseTo(0);
		expect(s.x).toBeCloseTo(50); // 30 apart plus a 20 box: not changed by a turn about X
		expect(s.z).toBeGreaterThan(20);
	});

	it('leaves the design alone for what cannot be tilted', () => {
		const d = box();
		expect(canTilt(d, ['b'])).toBe(true);
		expect(canTilt(d, [])).toBe(false);
		expect(canTilt(d, ['b', 'nope'])).toBe(false);
		expect(tiltNode(d, 'b', 0)).toBe(d);
		expect(tiltNode(d, 'nope', 30)).toBe(d);
		expect(tiltNode(d, 'b', Number.NaN)).toBe(d);
		const locked = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, locked: true } } };
		expect(canTilt(locked, ['b'])).toBe(false);
		expect(tiltNode(locked, 'b', 30)).toBe(locked);
	});
});

describe('whyNotTilt', () => {
	it('is null when the selection can be tilted', () => {
		expect(whyNotTilt(box(), ['b'])).toBeNull();
	});

	it('says what to select, and names a locked or hidden one', () => {
		const d = box();
		expect(whyNotTilt(d, [])).toBe('Select one shape or group to tilt it.');
		expect(whyNotTilt(addShape(d, 'box', [100, 0], { id: 'c' }).design, ['b', 'c'])).toBe('Select one shape or group to tilt it.');
		const locked = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, locked: true } } };
		expect(whyNotTilt(locked, ['b'])).toMatch(/locked/i);
		const hidden = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, hidden: true } } };
		expect(whyNotTilt(hidden, ['b'])).toMatch(/hidden/i);
	});

	it('agrees with canTilt', () => {
		const d = box();
		for (const ids of [[], ['nope'], ['b']]) expect(whyNotTilt(d, ids) === null).toBe(canTilt(d, ids));
	});
});
