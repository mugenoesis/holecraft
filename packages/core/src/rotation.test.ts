import { describe, expect, it } from 'vitest';
import {
  composeTransform,
  eulerOfTransform,
  eulerToMatrix,
  isUpright,
  matrixToEuler,
  multiplyMat3,
  rotateAboutWorldAxis,
  rotationOfTransform,
  shapeCenter,
  type Mat3,
} from './rotation.ts';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rad = (d: number) => (d * Math.PI) / 180;

function expectMat(actual: readonly number[], expected: readonly number[], digits = 9) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
}

describe('eulerToMatrix', () => {
  it('is the identity for no rotation', () => {
    expectMat(eulerToMatrix([0, 0, 0]), IDENTITY);
  });

  it('turns about Z counter-clockwise seen from above', () => {
    // +X rotates to +Y.
    const r = eulerToMatrix([0, 0, 90]);
    expectMat(r, [0, -1, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('turns about X so that +Y rotates towards +Z', () => {
    expectMat(eulerToMatrix([90, 0, 0]), [1, 0, 0, 0, 0, -1, 0, 1, 0]);
  });

  it('turns about Y so that +Z rotates towards +X', () => {
    expectMat(eulerToMatrix([0, 90, 0]), [0, 0, 1, 0, 1, 0, -1, 0, 0]);
  });

  it('applies X first, then Y, then Z, about the world axes', () => {
    const expected = multiplyMat3(eulerToMatrix([0, 0, 30]), multiplyMat3(eulerToMatrix([0, 40, 0]), eulerToMatrix([20, 0, 0])));
    expectMat(eulerToMatrix([20, 40, 30]), expected);
  });
});

describe('matrixToEuler', () => {
  it('round-trips ordinary angles', () => {
    for (const e of [[10, 20, 30], [-45, 30, 170], [90, 0, 0], [0, 0, -135], [179, -60, 5]] as const) {
      expectMat(matrixToEuler(eulerToMatrix([...e])), e, 6);
    }
  });

  it('reproduces the same orientation at gimbal lock, even if the angles differ', () => {
    for (const e of [[30, 90, 20], [10, -90, 40]] as const) {
      const m = eulerToMatrix([...e]);
      expectMat(eulerToMatrix(matrixToEuler(m)), m, 6);
    }
  });

  it('reports angles in (-180, 180] with no negative zero', () => {
    const e = matrixToEuler(eulerToMatrix([0, 0, 400]));
    expect(e[2]).toBeCloseTo(40, 6);
    for (const v of matrixToEuler(IDENTITY)) expect(Object.is(v, -0)).toBe(false);
  });
});

describe('transform helpers', () => {
  it('composes a column-major transform from a position and rotation', () => {
    const r = eulerToMatrix([0, 0, 90]);
    const m = composeTransform([5, 6, 7], r);
    expect(m).toHaveLength(16);
    expectMat(m.slice(12), [5, 6, 7, 1]);
    expectMat(m.slice(0, 4), [0, 1, 0, 0]); // first column: where +X goes
    expect(m[15]).toBe(1);
  });

  it('extracts the rotation back out', () => {
    const r = eulerToMatrix([15, 25, 35]);
    expectMat(rotationOfTransform(composeTransform([1, 2, 3], r)), r);
  });

  it('reads Euler angles off a transform', () => {
    expectMat(eulerOfTransform(composeTransform([0, 0, 0], eulerToMatrix([10, 20, 30]))), [10, 20, 30], 6);
  });
});

describe('shapeCenter', () => {
  it('is half the height above the base for an upright shape', () => {
    expectMat(shapeCenter(composeTransform([1, 2, 3], IDENTITY), 20), [1, 2, 13]);
  });

  it('follows the shape when it is tipped over', () => {
    // Tipped 90° about X, the shape's up axis points along -Y, so its centre swings out to the side.
    const c = shapeCenter(composeTransform([0, 0, 0], eulerToMatrix([90, 0, 0])), 20);
    expectMat(c, [0, -10, 0]);
  });
});

describe('rotateAboutWorldAxis', () => {
  it('rotates about the chosen world axis', () => {
    expectMat(rotateAboutWorldAxis(IDENTITY, 'z', rad(90)), eulerToMatrix([0, 0, 90]));
    expectMat(rotateAboutWorldAxis(IDENTITY, 'x', rad(90)), eulerToMatrix([90, 0, 0]));
    expectMat(rotateAboutWorldAxis(IDENTITY, 'y', rad(90)), eulerToMatrix([0, 90, 0]));
  });

  it('applies on top of the existing orientation, in world space', () => {
    const start = eulerToMatrix([0, 0, 90]);
    const after = rotateAboutWorldAxis(start, 'x', rad(90));
    expectMat(after, multiplyMat3(eulerToMatrix([90, 0, 0]), start));
  });

  it('is undone by the opposite angle', () => {
    const start = eulerToMatrix([20, 30, 40]);
    expectMat(rotateAboutWorldAxis(rotateAboutWorldAxis(start, 'y', rad(33)), 'y', rad(-33)), start, 9);
  });
});

describe('isUpright', () => {
  it('is true when only turned about the vertical axis', () => {
    expect(isUpright(eulerToMatrix([0, 0, 0]))).toBe(true);
    expect(isUpright(eulerToMatrix([0, 0, 77]))).toBe(true);
  });

  it('is false when tipped or upside down', () => {
    expect(isUpright(eulerToMatrix([10, 0, 0]))).toBe(false);
    expect(isUpright(eulerToMatrix([0, 5, 0]))).toBe(false);
    expect(isUpright(eulerToMatrix([180, 0, 0]))).toBe(false);
  });

  it('tolerates float noise from many small rotations', () => {
    let r: Mat3 = IDENTITY;
    for (let i = 0; i < 360; i++) r = rotateAboutWorldAxis(r, 'z', rad(1));
    expect(isUpright(r)).toBe(true);
  });
});
