import type { Vec3 } from './camera.ts';
import type { Mat4 } from './design.ts';

/**
 * Orientation maths. A rotation is a row-major 3x3 matrix; a node's `transform` (column-major
 * 4x4) is that rotation plus the position of the shape's base centre.
 *
 * Euler angles are in degrees and apply X first, then Y, then Z, all about the world axes
 * (R = Rz·Ry·Rx). Only the typed rotation fields use them; dragging a ring works on matrices.
 */
export type Mat3 = number[];
export type Axis = 'x' | 'y' | 'z';

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
/** Rounds away float noise, and turns -0 into 0. */
const tidy = (n: number) => Math.round(n * 1e9) / 1e9 + 0;

export const IDENTITY_ROTATION: Readonly<Mat3> = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export function multiplyMat3(a: readonly number[], b: readonly number[]): Mat3 {
  const out: Mat3 = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!);
  }
  return out;
}

function axisMatrix(axis: Axis, angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function eulerToMatrix([rx, ry, rz]: readonly number[]): Mat3 {
  return multiplyMat3(axisMatrix('z', rad(rz!)), multiplyMat3(axisMatrix('y', rad(ry!)), axisMatrix('x', rad(rx!))));
}

/** Angles in (-180, 180]. At gimbal lock (Y = ±90°) the Z angle is taken as 0. */
export function matrixToEuler(r: readonly number[]): [number, number, number] {
  const sinB = Math.max(-1, Math.min(1, -r[6]!));
  const beta = Math.asin(sinB);
  let alpha: number;
  let gamma: number;
  if (Math.abs(sinB) < 1 - 1e-9) {
    alpha = Math.atan2(r[7]!, r[8]!);
    gamma = Math.atan2(r[3]!, r[0]!);
  } else {
    gamma = 0;
    alpha = sinB > 0 ? Math.atan2(r[1]!, r[4]!) : Math.atan2(-r[1]!, r[4]!);
  }
  const clean = (a: number) => {
    const d = tidy(deg(a));
    return d === -180 ? 180 : d;
  };
  return [clean(alpha), clean(beta), clean(gamma)];
}

export function rotationOfTransform(m: Readonly<Mat4>): Mat3 {
  return [m[0]!, m[4]!, m[8]!, m[1]!, m[5]!, m[9]!, m[2]!, m[6]!, m[10]!];
}

export function eulerOfTransform(m: Readonly<Mat4>): [number, number, number] {
  return matrixToEuler(rotationOfTransform(m));
}

export function composeTransform(position: Vec3, r: readonly number[]): Mat4 {
  return [r[0]!, r[3]!, r[6]!, 0, r[1]!, r[4]!, r[7]!, 0, r[2]!, r[5]!, r[8]!, 0, position[0], position[1], position[2], 1];
}

/** Middle of a shape (half its height above its base centre, along its own up axis), in world space. */
export function shapeCenter(m: Readonly<Mat4>, height: number): Vec3 {
  const h = height / 2;
  return [m[12]! + m[8]! * h, m[13]! + m[9]! * h, m[14]! + m[10]! * h];
}

/** `r` turned by `angle` radians about a world axis. */
export function rotateAboutWorldAxis(r: readonly number[], axis: Axis, angle: number): Mat3 {
  return multiplyMat3(axisMatrix(axis, angle), r);
}

/** True when the shape's up axis is still vertical, i.e. it is only turned about Z. */
export function isUpright(r: readonly number[]): boolean {
  return r[8]! > 1 - 1e-6;
}
