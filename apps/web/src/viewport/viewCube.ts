/**
 * CSS transform that spins the view cube to match the camera.
 *
 * The cube is built in a local frame where the front face is +z (towards the viewer), the
 * top face is -y and the right face is +x, i.e. local (a, b, c) = world (x, -z, -y). CSS has
 * y pointing down, so the camera's y is flipped on the way out. The two flips cancel, which
 * keeps the result a proper rotation.
 *
 * `rotation` is the row-major world→camera matrix from `viewRotation` in @holecraft/core.
 */
export function viewCubeMatrix(rotation: readonly number[]): string {
  const r = (row: number, col: number) => rotation[row * 3 + col]!;
  const colA = [r(0, 0), -r(1, 0), r(2, 0)];
  const colB = [-r(0, 2), r(1, 2), -r(2, 2)];
  const colC = [-r(0, 1), r(1, 1), -r(2, 1)];
  const values = [...colA, 0, ...colB, 0, ...colC, 0, 0, 0, 0, 1];
  // Number() drops "-0" and trailing zeros; rounding avoids exponent notation, which CSS rejects.
  return `matrix3d(${values.map((v) => Number(v.toFixed(6))).join(', ')})`;
}
