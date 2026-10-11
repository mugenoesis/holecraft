import { describe, expect, it } from 'vitest';
import {
  HOME_VIEW,
  MAX_DISTANCE,
  MIN_DISTANCE,
  VIEW_PRESETS,
  applyViewPreset,
  cameraPosition,
  fitDistance,
  fitToBounds,
  orbit,
  pan,
  viewRotation,
  zoom,
  type OrbitState,
} from './camera.ts';

const front: OrbitState = { target: [0, 0, 0], azimuth: 0, polar: Math.PI / 2, distance: 100 };

function expectVec(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 6));
}

describe('cameraPosition (Z-up, azimuth 0 looks at the front from -Y)', () => {
  it('places the camera in front, right, behind and above', () => {
    expectVec(cameraPosition(front), [0, -100, 0]);
    expectVec(cameraPosition({ ...front, azimuth: Math.PI / 2 }), [100, 0, 0]);
    expectVec(cameraPosition({ ...front, azimuth: Math.PI }), [0, 100, 0]);
    expectVec(cameraPosition({ ...front, polar: 0.0001 }), [0, -0.01, 100]);
  });

  it('is relative to the target', () => {
    expectVec(cameraPosition({ ...front, target: [10, 20, 30] }), [10, -80, 30]);
  });
});

describe('orbit', () => {
  it('adds the deltas', () => {
    const s = orbit(front, 0.5, -0.25);
    expect(s.azimuth).toBeCloseTo(0.5);
    expect(s.polar).toBeCloseTo(Math.PI / 2 - 0.25);
  });

  it('never flips over the poles', () => {
    expect(orbit(front, 0, -10).polar).toBeGreaterThan(0);
    expect(orbit(front, 0, 10).polar).toBeLessThan(Math.PI);
  });

  it('does not mutate its input', () => {
    orbit(front, 1, 1);
    expect(front.azimuth).toBe(0);
  });
});

describe('zoom', () => {
  it('scales the distance', () => {
    expect(zoom(front, 0.5).distance).toBeCloseTo(50);
  });

  it('clamps to the allowed range', () => {
    expect(zoom(front, 1e-9).distance).toBe(MIN_DISTANCE);
    expect(zoom(front, 1e9).distance).toBe(MAX_DISTANCE);
  });
});

describe('pan', () => {
  const fov = 40;
  const heightPx = 800;
  const worldPerPx = (2 * 100 * Math.tan((fov * Math.PI) / 360)) / heightPx;

  it('drags the scene with the pointer: dragging right moves the target left', () => {
    const s = pan(front, 100, 0, heightPx, fov);
    expectVec(s.target, [-100 * worldPerPx, 0, 0]);
  });

  it('dragging down moves the target up', () => {
    const s = pan(front, 0, 50, heightPx, fov);
    expectVec(s.target, [0, 0, 50 * worldPerPx]);
  });

  it('pans in the screen plane from a rotated view', () => {
    const s = pan({ ...front, azimuth: Math.PI / 2 }, 100, 0, heightPx, fov);
    // Camera on +X looking at -X: screen-right is +Y, so the target moves to -Y.
    expectVec(s.target, [0, -100 * worldPerPx, 0]);
  });
});

describe('viewRotation', () => {
  it('returns right, up and back vectors as rows', () => {
    expectVec(viewRotation(front), [1, 0, 0, 0, 0, 1, 0, -1, 0]);
  });

  it('looking from the right, screen-right is +Y', () => {
    expectVec(viewRotation({ ...front, azimuth: Math.PI / 2 }), [0, 1, 0, 0, 0, 1, 1, 0, 0]);
  });

  it('is orthonormal for an arbitrary view', () => {
    const r = viewRotation(HOME_VIEW);
    const dot = (a: number, b: number) => [0, 1, 2].reduce((sum, k) => sum + r[a * 3 + k]! * r[b * 3 + k]!, 0);
    expect(dot(0, 0)).toBeCloseTo(1);
    expect(dot(1, 1)).toBeCloseTo(1);
    expect(dot(2, 2)).toBeCloseTo(1);
    expect(dot(0, 1)).toBeCloseTo(0);
    expect(dot(0, 2)).toBeCloseTo(0);
    expect(dot(1, 2)).toBeCloseTo(0);
  });

  it('is well-defined looking straight down', () => {
    const r = viewRotation({ ...front, polar: 0 });
    expect(r.every(Number.isFinite)).toBe(true);
  });
});

describe('fitDistance', () => {
  it('fits a sphere in a square view', () => {
    expect(fitDistance(10, 40, 1)).toBeCloseTo(10 / Math.sin((40 * Math.PI) / 360));
  });

  it('backs off further for narrow views', () => {
    expect(fitDistance(10, 40, 0.5)).toBeGreaterThan(fitDistance(10, 40, 1));
  });

  it('does not need extra distance for wide views', () => {
    expect(fitDistance(10, 40, 2)).toBeCloseTo(fitDistance(10, 40, 1));
  });
});

describe('fitToBounds', () => {
  it('centres the target on the bounds and frames them', () => {
    const s = fitToBounds(front, { min: [0, 0, 0], max: [20, 20, 20] }, 40, 1);
    expectVec(s.target, [10, 10, 10]);
    expect(s.distance).toBeGreaterThan(fitDistance(Math.sqrt(300), 40, 1) - 1e-9);
    expect(s.azimuth).toBe(front.azimuth);
  });

  it('never zooms in past the minimum distance for tiny objects', () => {
    const s = fitToBounds(front, { min: [0, 0, 0], max: [0.1, 0.1, 0.1] }, 40, 1);
    expect(s.distance).toBe(MIN_DISTANCE);
  });
});

describe('view presets', () => {
  it('has the six axis views plus an isometric one', () => {
    expect(Object.keys(VIEW_PRESETS).sort()).toEqual(['back', 'bottom', 'front', 'iso', 'left', 'right', 'top']);
  });

  it('puts the camera on the named side', () => {
    const at = (name: keyof typeof VIEW_PRESETS) => cameraPosition(applyViewPreset(front, name));
    expect(at('front')[1]).toBeLessThan(-99);
    expect(at('back')[1]).toBeGreaterThan(99);
    expect(at('right')[0]).toBeGreaterThan(99);
    expect(at('left')[0]).toBeLessThan(-99);
    expect(at('top')[2]).toBeGreaterThan(99);
    expect(at('bottom')[2]).toBeLessThan(-99);
  });

  it('keeps the target and distance', () => {
    const s = applyViewPreset({ ...front, target: [1, 2, 3], distance: 42 }, 'top');
    expect(s.target).toEqual([1, 2, 3]);
    expect(s.distance).toBe(42);
  });
});
