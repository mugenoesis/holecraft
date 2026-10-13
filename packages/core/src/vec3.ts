import type { Vec3 } from './camera.ts';

/** Small vector helpers for the mesh code (paint, edges). */

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** The point of the triangle nearest `p`. */
export function closestOnTriangle(p: Vec3, [a, b, c]: Vec3[]): Vec3 {
	const ab = sub(b!, a!);
	const ac = sub(c!, a!);
	const ap = sub(p, a!);
	const d1 = dot(ab, ap);
	const d2 = dot(ac, ap);
	if (d1 <= 0 && d2 <= 0) return a!;
	const bp = sub(p, b!);
	const d3 = dot(ab, bp);
	const d4 = dot(ac, bp);
	if (d3 >= 0 && d4 <= d3) return b!;
	const vc = d1 * d4 - d3 * d2;
	if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a!, scale(ab, d1 / (d1 - d3)));
	const cp = sub(p, c!);
	const d5 = dot(ab, cp);
	const d6 = dot(ac, cp);
	if (d6 >= 0 && d5 <= d6) return c!;
	const vb = d5 * d2 - d1 * d6;
	if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a!, scale(ac, d2 / (d2 - d6)));
	const va = d3 * d6 - d5 * d4;
	if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b!, scale(sub(c!, b!), (d4 - d3) / (d4 - d3 + (d5 - d6))));
	const denom = 1 / (va + vb + vc);
	return add(a!, add(scale(ab, vb * denom), scale(ac, vc * denom)));
}
