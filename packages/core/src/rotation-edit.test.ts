import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design } from './design.ts';
import { dropToWorkplane, duplicateNodes, moveNodes, setNodeEuler, setNodeRotation } from './edit.ts';
import { addShape, designBounds, nodeBounds, translationOf } from './ops.ts';
import { eulerOfTransform, eulerToMatrix, shapeCenter } from './rotation.ts';

function scene(): Design {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
	return d;
}

const node = (d: Design, id: string) => d.nodes[id]!;
const center = (d: Design, id: string) => shapeCenter(node(d, id).transform, 20);

function close(actual: readonly number[], expected: readonly number[], digits = 6) {
	expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
}

describe('setNodeEuler', () => {
	it('turns the shape about its own centre, not its base', () => {
		const d = setNodeEuler(scene(), 'a', [0, 0, 90]);
		close(eulerOfTransform(node(d, 'a').transform), [0, 0, 90]);
		close(center(d, 'a'), [0, 0, 10]);
	});

	it('keeps the centre fixed when tipping over', () => {
		const d = setNodeEuler(scene(), 'a', [45, 0, 0]);
		close(center(d, 'a'), [0, 0, 10]);
		// The base centre must have moved to compensate: it is no longer at z = 0.
		expect(translationOf(node(d, 'a').transform)[2]).toBeCloseTo(10 - 10 * Math.cos(Math.PI / 4), 6);
	});

	it('keeps size untouched', () => {
		const d = setNodeEuler(scene(), 'a', [10, 20, 30]);
		expect(node(d, 'a')).toMatchObject({ params: { width: 20, depth: 20, height: 20 } });
	});

	it('returns the same design when the rotation does not change', () => {
		const d = scene();
		expect(setNodeEuler(d, 'a', [0, 0, 0])).toBe(d);
		const turned = setNodeEuler(d, 'a', [0, 0, 30]);
		expect(setNodeEuler(turned, 'a', [0, 0, 30])).toBe(turned);
	});

	it('rejects non-finite angles and unknown or locked shapes', () => {
		const d = scene();
		expect(setNodeEuler(d, 'a', [Number.NaN, 0, 0])).toBe(d);
		expect(setNodeEuler(d, 'a', [0, Infinity, 0])).toBe(d);
		expect(setNodeEuler(d, 'nope', [0, 0, 10])).toBe(d);
		d.nodes.a!.locked = true;
		expect(setNodeEuler(d, 'a', [0, 0, 10])).toBe(d);
	});

	it('does not mutate the original', () => {
		const d = scene();
		setNodeEuler(d, 'a', [0, 0, 45]);
		close(eulerOfTransform(node(d, 'a').transform), [0, 0, 0]);
	});

	it('treats equivalent angles as unchanged', () => {
		const turned = setNodeEuler(scene(), 'a', [0, 0, 40]);
		expect(setNodeEuler(turned, 'a', [0, 0, 400])).toBe(turned);
	});
});

describe('setNodeRotation', () => {
	it('accepts a matrix directly', () => {
		const d = setNodeRotation(scene(), 'a', eulerToMatrix([0, 0, 60]));
		close(eulerOfTransform(node(d, 'a').transform), [0, 0, 60]);
	});

	it('rejects matrices with non-finite entries', () => {
		const d = scene();
		const bad = eulerToMatrix([0, 0, 10]);
		bad[4] = Number.NaN;
		expect(setNodeRotation(d, 'a', bad)).toBe(d);
	});
});

describe('moving a rotated shape', () => {
	it('keeps its rotation', () => {
		const turned = setNodeEuler(scene(), 'a', [0, 0, 30]);
		const moved = moveNodes(turned, ['a'], [10, 5, 0]);
		close(eulerOfTransform(node(moved, 'a').transform), [0, 0, 30]);
		close(translationOf(node(moved, 'a').transform), [10, 5, 0]);
	});
});

describe('nodeBounds and designBounds with rotation', () => {
	it('is unchanged for an upright shape', () => {
		expect(nodeBounds(node(scene(), 'a'))).toEqual({ min: [-10, -10, 0], max: [10, 10, 20] });
	});

	it('grows to hold a shape turned 45° about Z', () => {
		const d = setNodeEuler(scene(), 'a', [0, 0, 45]);
		const b = nodeBounds(node(d, 'a'))!;
		const half = 10 * Math.SQRT2;
		close(b.min, [-half, -half, 0]);
		close(b.max, [half, half, 20]);
	});

	it('follows a shape tipped over on its side', () => {
		const d = setNodeEuler(scene(), 'a', [90, 0, 0]);
		const b = nodeBounds(node(d, 'a'))!;
		close(b.min, [-10, -10, 0]); // a 20 mm cube on its side occupies the same space
		close(b.max, [10, 10, 20]);
	});

	it('designBounds covers rotated shapes', () => {
		const d = setNodeEuler(scene(), 'a', [0, 0, 45]);
		expect(designBounds(d)!.min[0]).toBeCloseTo(-10 * Math.SQRT2, 6);
	});

	it('is null for hidden or non-shape nodes', () => {
		const d = scene();
		d.nodes.a!.hidden = true;
		expect(nodeBounds(node(d, 'a'))).toBeNull();
	});
});

describe('dropToWorkplane with rotation', () => {
	it('rests the lowest point of a tipped shape on the workplane', () => {
		let d = setNodeEuler(scene(), 'a', [45, 0, 0]);
		// The corner of the tipped cube dips below the plane; dropping lifts it exactly clear.
		expect(nodeBounds(node(d, 'a'))!.min[2]).toBeLessThan(-1);
		d = dropToWorkplane(d, ['a']);
		expect(nodeBounds(node(d, 'a'))!.min[2]).toBeCloseTo(0, 6);
	});

	it('only moves the shape vertically', () => {
		const turned = setNodeEuler(moveNodes(scene(), ['a'], [7, 8, 0]), 'a', [30, 0, 0]);
		const dropped = dropToWorkplane(turned, ['a']);
		// Tipping moves the base point so the centre stays put; dropping must leave the centre's
		// X and Y alone and change only its height.
		const [x, y] = center(dropped, 'a');
		expect(x).toBeCloseTo(7, 6);
		expect(y).toBeCloseTo(8, 6);
	});

	it('leaves an upright shape on the plane alone', () => {
		const d = setNodeEuler(scene(), 'a', [0, 0, 77]);
		expect(dropToWorkplane(d, ['a'])).toBe(d);
	});

	it('still lowers a floating upright shape', () => {
		const up = moveNodes(scene(), ['a'], [0, 0, 25]);
		expect(translationOf(node(dropToWorkplane(up, ['a']), 'a').transform)[2]).toBe(0);
	});
});

describe('duplicating a rotated shape', () => {
	it('keeps the rotation', () => {
		const turned = setNodeEuler(scene(), 'a', [10, 20, 30]);
		const { design, ids } = duplicateNodes(turned, ['a'], [15, 0]);
		close(eulerOfTransform(node(design, ids[0]!).transform), [10, 20, 30]);
	});
});
