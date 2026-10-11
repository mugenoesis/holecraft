import { VIEW_PRESETS, viewRotation, type OrbitState } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { viewCubeMatrix } from './viewCube.ts';

const level = (azimuth: number): OrbitState => ({ target: [0, 0, 0], azimuth, polar: Math.PI / 2, distance: 100 });

function parse(css: string): number[] {
  const m = /^matrix3d\((.+)\)$/.exec(css);
  if (!m) throw new Error(`not a matrix3d: ${css}`);
  return m[1]!.split(',').map(Number);
}

describe('viewCubeMatrix', () => {
  it('is the identity for the front view, so the front face points at the viewer', () => {
    const m = parse(viewCubeMatrix(viewRotation(level(0))));
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 5));
  });

  it('brings the right face (local +x) to the viewer when looking from the right', () => {
    const m = parse(viewCubeMatrix(viewRotation(level(VIEW_PRESETS.right.azimuth))));
    // First column is where local +x lands in screen space: out of the screen, towards the viewer.
    expect(m[0]).toBeCloseTo(0, 5);
    expect(m[1]).toBeCloseTo(0, 5);
    expect(m[2]).toBeCloseTo(1, 5);
  });

  it('shows the top face when looking down from above', () => {
    const m = parse(viewCubeMatrix(viewRotation({ ...level(0), polar: VIEW_PRESETS.top.polar })));
    // Local -y is the top face; it must point towards the viewer (+z on screen).
    expect(-m[5]!).toBeCloseTo(0, 2);
    expect(-m[6]!).toBeGreaterThan(0.99);
  });

  it('is a proper rotation (determinant +1) for an arbitrary view', () => {
    const m = parse(viewCubeMatrix(viewRotation({ target: [0, 0, 0], azimuth: -0.6, polar: 1.0, distance: 330 })));
    const [a, b, c] = [m.slice(0, 3), m.slice(4, 7), m.slice(8, 11)] as [number[], number[], number[]];
    const det =
      a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);
    expect(det).toBeCloseTo(1, 5);
  });

  it('never emits -0 or exponent noise that CSS would reject', () => {
    const css = viewCubeMatrix(viewRotation(level(0)));
    expect(css).not.toMatch(/-0(?![.\d])/);
    expect(css).not.toMatch(/e-?\d/);
  });
});
