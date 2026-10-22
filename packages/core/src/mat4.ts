import type { Vec3 } from './camera.ts';
import type { Mat4 } from './design.ts';

/** a · b for column-major 4x4 matrices: the result applies `b` first, then `a`. */
export function multiplyMat4(a: Readonly<Mat4>, b: Readonly<Mat4>): Mat4 {
	const out: Mat4 = new Array<number>(16).fill(0);
	for (let col = 0; col < 4; col++) {
		for (let row = 0; row < 4; row++) {
			let sum = 0;
			for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
			out[col * 4 + row] = sum;
		}
	}
	return out;
}

export function transformPoint(m: Readonly<Mat4>, p: Vec3): Vec3 {
	return [
		m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
		m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
		m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
	];
}

/** Inverse of a rotation + translation matrix (transforms here never scale). */
export function rigidInverse(m: Readonly<Mat4>): Mat4 {
	const r = (row: number, col: number) => m[col * 4 + row]!; // the transpose of the rotation
	const t = [m[12]!, m[13]!, m[14]!];
	const out: Mat4 = new Array<number>(16).fill(0);
	for (let col = 0; col < 3; col++) {
		for (let row = 0; row < 3; row++) out[col * 4 + row] = r(col, row);
		out[12 + col] = -(out[col]! * t[0]! + out[4 + col]! * t[1]! + out[8 + col]! * t[2]!);
	}
	out[15] = 1;
	return out;
}

/** The inverse of any matrix that is a turn, a stretch and a move (the bottom row 0 0 0 1), or null when it flattens space. */
export function invertAffine(m: Readonly<Mat4>): Mat4 | null {
	const [a, b, c] = [m[0]!, m[4]!, m[8]!];
	const [d, e, f] = [m[1]!, m[5]!, m[9]!];
	const [g, h, i] = [m[2]!, m[6]!, m[10]!];
	const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
	if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
	const inv = [
		(e * i - f * h) / det,
		(c * h - b * i) / det,
		(b * f - c * e) / det,
		(f * g - d * i) / det,
		(a * i - c * g) / det,
		(c * d - a * f) / det,
		(d * h - e * g) / det,
		(b * g - a * h) / det,
		(a * e - b * d) / det,
	];
	const t = [m[12]!, m[13]!, m[14]!];
	const out: Mat4 = new Array<number>(16).fill(0);
	// inv holds the rows of the inverse of the 3x3 part: row r, column c is inv[r * 3 + c]
	for (let col = 0; col < 3; col++) {
		for (let row = 0; row < 3; row++) out[col * 4 + row] = inv[row * 3 + col]!;
		out[12 + col] = -(inv[col * 3]! * t[0]! + inv[col * 3 + 1]! * t[1]! + inv[col * 3 + 2]! * t[2]!);
	}
	out[15] = 1;
	return out;
}
