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
