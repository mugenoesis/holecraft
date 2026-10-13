import type { Vec3 } from './camera.ts';
import type { Mat4 } from './design.ts';
import type { SketchPoint } from './sketch.ts';
import { planeFrame, type WorkPlane } from './surfacePlane.ts';

/**
 * The plane a sketch is drawn in: where its origin is in the world and which way its x, y and normal point. A new sketch is drawn in a
 * Workplane's frame; a sketch being redrawn is in its shape's own frame, which may be turned about its normal since it was made.
 */
export interface SketchFrame {
	origin: Vec3;
	u: Vec3;
	v: Vec3;
	normal: Vec3;
}

export function frameOfPlane(plane: WorkPlane): SketchFrame {
	const r = planeFrame(plane.normal);
	return { origin: plane.origin, u: [r[0]!, r[3]!, r[6]!], v: [r[1]!, r[4]!, r[7]!], normal: [r[2]!, r[5]!, r[8]!] };
}

/** A shape's own frame in the world (its transform's columns): the plane its drawing is on. */
export function frameOfNode(node: { transform: Readonly<Mat4> }): SketchFrame {
	const m = node.transform;
	return { origin: [m[12]!, m[13]!, m[14]!], u: [m[0]!, m[1]!, m[2]!], v: [m[4]!, m[5]!, m[6]!], normal: [m[8]!, m[9]!, m[10]!] };
}

/** The world point at (x, y) in the frame. */
export function fromFrame(frame: SketchFrame, [x, y]: SketchPoint): Vec3 {
	return [0, 1, 2].map((k) => frame.origin[k]! + frame.u[k]! * x + frame.v[k]! * y) as Vec3;
}

/** A world point's (x, y) in the frame (its distance from the plane is dropped). */
export function toFrame(frame: SketchFrame, p: Vec3): SketchPoint {
	const d = [0, 1, 2].map((k) => p[k]! - frame.origin[k]!);
	const dot = (a: Vec3) => d[0]! * a[0] + d[1]! * a[1] + d[2]! * a[2];
	return [dot(frame.u) + 0, dot(frame.v) + 0];
}
