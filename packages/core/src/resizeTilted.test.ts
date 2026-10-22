import { describe, expect, it } from 'vitest';
import { dragHandle, HANDLE_IDS, handlePosition, type ShapeGeometry } from './resize.ts';
import { closestParamOnLine, dragHandleTilted, handlePositionTilted, lowestPointOffset } from './resizeTilted.ts';
import { eulerToMatrix, IDENTITY_ROTATION } from './rotation.ts';

const box: ShapeGeometry = { x: 0, y: 0, z: 30, width: 20, depth: 20, height: 20 };
const off = { snap: 0, uniform: false, fromCenter: false };
/** Turned a quarter about X: the shape's own y points up and its own z points towards -y. */
const onItsSide = eulerToMatrix([90, 0, 0]);

const near = (actual: readonly number[], expected: readonly number[]) => {
	expect(actual).toHaveLength(expected.length);
	for (const [i, e] of expected.entries()) expect(actual[i], `component ${i}`).toBeCloseTo(e, 6);
};
const sizes = (g: ShapeGeometry) => [g.width, g.depth, g.height];
const origin = (g: ShapeGeometry) => [g.x, g.y, g.z];

describe('handlePositionTilted', () => {
	it('is handlePosition when the shape is not turned', () => {
		for (const id of HANDLE_IDS) near(handlePositionTilted(box, IDENTITY_ROTATION, id), handlePosition(box, id));
	});

	it("puts the handles on the shape's own axes when it is turned", () => {
		// own z (the height direction) now points along -y, own y along +z
		near(handlePositionTilted(box, onItsSide, 'height'), [0, -20, 30]);
		near(handlePositionTilted(box, onItsSide, 'side-py'), [0, 0, 40]);
		near(handlePositionTilted(box, onItsSide, 'side-px'), [10, 0, 30]);
		near(handlePositionTilted(box, onItsSide, 'corner-pn'), [10, 0, 20]); // own (+x, -y) is world (+x, ., -z)
	});

	it('floats the lift handle at the top end of the shape', () => {
		near(handlePositionTilted(box, onItsSide, 'lift'), handlePositionTilted(box, onItsSide, 'height'));
	});
});

describe('dragHandleTilted', () => {
	it('is dragHandle when the shape is not turned', () => {
		for (const id of ['corner-pp', 'corner-nn', 'side-px', 'side-ny', 'height'] as const) {
			const target: [number, number, number] = [17, -13, 44];
			const want = dragHandle(box, id, target, off);
			// dragHandle's height handle reads the world z; the tilted one reads the distance along the axis from the base
			const target2: [number, number, number] = id === 'height' ? [0, 0, 44] : [target[0], target[1], box.z];
			const got = dragHandleTilted(box, IDENTITY_ROTATION, id, target2, off);
			near(sizes(got), sizes(want));
			near(origin(got), origin(want));
		}
	});

	it("drags the height handle along the shape's own axis", () => {
		// own z points along -y: dragging 35 mm out that way makes the shape 35 tall
		const got = dragHandleTilted(box, onItsSide, 'height', [0, -35, 30], off);
		near(sizes(got), [20, 20, 35]);
		near(origin(got), origin(box));
	});

	it('resizes a side in the shape’s own frame, keeping the opposite side where it is', () => {
		// own x is still world x: pulling +x out to 15 makes it 25 wide, centre shifts 2.5 along x
		const got = dragHandleTilted(box, onItsSide, 'side-px', [15, 0, 37], off);
		near(sizes(got), [25, 20, 20]);
		near(origin(got), [2.5, 0, 30]);
	});

	it("moves the base centre along the shape's own y, which is up in the world", () => {
		const got = dragHandleTilted(box, onItsSide, 'side-py', [0, 0, 45], off);
		near(sizes(got), [20, 25, 20]); // own y reaches 15 above the base centre: 10 below to 15 above
		near(origin(got), [0, 0, 32.5]);
	});

	it('snaps in the shape’s own frame', () => {
		const got = dragHandleTilted(box, onItsSide, 'height', [0, -33.4, 30], { ...off, snap: 5 });
		expect(got.height).toBe(35);
	});

	it('scales all three sizes together with Shift on the height handle', () => {
		const got = dragHandleTilted(box, onItsSide, 'height', [0, -40, 30], { ...off, uniform: true });
		near(sizes(got), [40, 40, 40]);
		near(origin(got), origin(box));
	});

	it('never lets a size pass through its fixed side', () => {
		const got = dragHandleTilted(box, onItsSide, 'height', [0, 50, 30], off); // the wrong way, below the base
		expect(got.height).toBeGreaterThan(0);
	});

	it('lifts along the world vertical, whatever the shape is turned like', () => {
		// the top end is at the base's height here (own z is horizontal), so the handle follows the pointer's height
		const got = dragHandleTilted(box, onItsSide, 'lift', [0, -20, 50], off);
		near(origin(got), [0, 0, 50]);
		near(sizes(got), sizes(box));
	});

	it('can lift it through the workplane: its lowest corner may go under it', () => {
		// turned on its side the shape reaches 10 below its base centre, so the base centre at 3 puts its lowest corner 7 mm under the plane
		const got = dragHandleTilted(box, onItsSide, 'lift', [0, -20, 3], off);
		near(origin(got), [0, 0, 3]);
	});
});

describe('lowestPointOffset', () => {
	it('is 0 for an upright shape (the base is the lowest)', () => {
		expect(lowestPointOffset(box, IDENTITY_ROTATION)).toBeCloseTo(0, 9);
	});

	it('is how far the lowest corner hangs below the base centre', () => {
		expect(lowestPointOffset(box, onItsSide)).toBeCloseTo(-10, 9);
		expect(lowestPointOffset(box, eulerToMatrix([180, 0, 0]))).toBeCloseTo(-20, 9); // upside down
	});
});

describe('closestParamOnLine', () => {
	const axis: [number[], number[]] = [
		[0, 0, 0],
		[0, 0, 1],
	];

	it('is where along a line a ray passes it', () => {
		expect(closestParamOnLine([10, 0, 7], [-1, 0, 0], axis[0]!, axis[1]!)).toBeCloseTo(7, 9);
	});

	it('is the closest point when the ray misses the line', () => {
		expect(closestParamOnLine([10, 3, 7], [-1, 0, 0], axis[0]!, axis[1]!)).toBeCloseTo(7, 9);
	});

	it('works for a line that is not vertical, and gives a negative number behind the origin', () => {
		expect(closestParamOnLine([5, 0, 8], [0, -1, 0], [0, 0, 8], [1, 0, 0])).toBeCloseTo(5, 9);
		expect(closestParamOnLine([-5, 0, 8], [0, -1, 0], [0, 0, 8], [1, 0, 0])).toBeCloseTo(-5, 9);
	});

	it('is null when the ray runs along the line (no single closest point)', () => {
		expect(closestParamOnLine([3, 0, 0], [0, 0, 1], axis[0]!, axis[1]!)).toBeNull();
	});
});
