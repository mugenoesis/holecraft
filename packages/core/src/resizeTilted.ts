import type { Vec3 } from './camera.ts';
import { MAX_SHAPE_SIZE } from './edit.ts';
import { snapToGrid } from './grid.ts';
import { type DragOptions, dragHandle, type HandleId, handlePosition, type ShapeGeometry } from './resize.ts';

/**
 * Resize and lift handles for a shape that is turned about X or Y as well (the upright ones in resize.ts only know
 * a turn about the vertical). `g.x, g.y, g.z` is the base centre in the world, as everywhere, and `rotation` is the
 * shape's row-major 3x3 turn: a point at `p` in the shape's own frame is at `origin + rotation * p` in the world.
 * The shape's sizes are along its own axes, so a handle always changes the size it belongs to, however it is tipped.
 */

const apply = (r: readonly number[], v: Vec3): Vec3 => [
	r[0]! * v[0] + r[1]! * v[1] + r[2]! * v[2],
	r[3]! * v[0] + r[4]! * v[1] + r[5]! * v[2],
	r[6]! * v[0] + r[7]! * v[1] + r[8]! * v[2],
];

/** `r` transposed applied to `v`: the way back from the world into the shape's own frame. */
const applyBack = (r: readonly number[], v: Vec3): Vec3 => [
	r[0]! * v[0] + r[3]! * v[1] + r[6]! * v[2],
	r[1]! * v[0] + r[4]! * v[1] + r[7]! * v[2],
	r[2]! * v[0] + r[5]! * v[1] + r[8]! * v[2],
];

const tidy = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

/** World position of a handle on a shape turned by `rotation`: where it sits on the shape's own base and top. */
export function handlePositionTilted(g: ShapeGeometry, rotation: readonly number[], id: HandleId): Vec3 {
	const own = handlePosition({ ...g, x: 0, y: 0, z: 0 }, id);
	const world = apply(rotation, own);
	return [g.x + world[0], g.y + world[1], g.z + world[2]];
}

/**
 * How far the lowest corner of the shape's box hangs below (negative) or sits above its base centre, in the world.
 * A tipped shape reaches below its own base, which is how far down the lift handle may go before it rests on the floor.
 */
export function lowestPointOffset(g: ShapeGeometry, rotation: readonly number[]): number {
	let lowest = Number.POSITIVE_INFINITY;
	for (const sx of [-1, 1]) {
		for (const sy of [-1, 1]) {
			for (const z of [0, g.height]) {
				lowest = Math.min(lowest, apply(rotation, [(sx * g.width) / 2, (sy * g.depth) / 2, z])[2]);
			}
		}
	}
	return lowest;
}

/**
 * The geometry after dragging a handle on a turned shape to `target` (a world point). Sides and corners are meant to be
 * aimed at the plane of the shape's own base, the height handle at its own up axis, and the lift handle at the world
 * vertical through the handle. The drag itself is worked out in the shape's own frame, like a yawed shape's.
 */
export function dragHandleTilted(
	start: ShapeGeometry,
	rotation: readonly number[],
	id: HandleId,
	target: Vec3,
	opts: DragOptions,
): ShapeGeometry {
	if (id === 'lift') return liftTilted(start, rotation, target[2], opts.snap);

	const [lx, ly, lz] = applyBack(rotation, [target[0] - start.x, target[1] - start.y, target[2] - start.z]);
	const own = dragHandle({ ...start, x: 0, y: 0, z: 0 }, id, [lx, ly, lz], opts);
	const [wx, wy, wz] = apply(rotation, [own.x, own.y, 0]);
	return { ...own, x: tidy(start.x + wx), y: tidy(start.y + wy), z: tidy(start.z + wz) };
}

/** Raises or lowers the whole shape so its top-end handle is under `targetZ`, never so low that it dips below the floor. */
function liftTilted(start: ShapeGeometry, rotation: readonly number[], targetZ: number, snap: number): ShapeGeometry {
	const topAbove = rotation[8]! * start.height; // how far the top end is above the base centre
	const floor = -lowestPointOffset(start, rotation);
	const z = Math.min(MAX_SHAPE_SIZE, Math.max(floor, snapToGrid(targetZ - topAbove, snap)));
	return { ...start, z: tidy(z) };
}

/**
 * Where along a line a ray passes closest to it, as a distance from `lineOrigin` along `lineDir` (a unit vector).
 * This is how a pointer picks a position along a shape's own up axis. Null when the ray runs along the line.
 */
export function closestParamOnLine(
	rayOrigin: readonly number[],
	rayDir: readonly number[],
	lineOrigin: readonly number[],
	lineDir: readonly number[],
): number | null {
	const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
	const w = [rayOrigin[0]! - lineOrigin[0]!, rayOrigin[1]! - lineOrigin[1]!, rayOrigin[2]! - lineOrigin[2]!];
	const b = dot(rayDir, lineDir);
	const denominator = dot(rayDir, rayDir) * dot(lineDir, lineDir) - b * b;
	if (denominator < 1e-9 * dot(rayDir, rayDir) * dot(lineDir, lineDir)) return null;
	return (dot(rayDir, rayDir) * dot(w, lineDir) - b * dot(w, rayDir)) / denominator;
}
