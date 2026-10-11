import { describe, expect, it } from 'vitest';
import { twoFingerStep } from './touchGesture.ts';

const at = (x: number, y: number) => ({ x, y });

describe('twoFingerStep', () => {
  it('does nothing when the fingers have not moved', () => {
    const step = twoFingerStep([at(0, 0), at(100, 0)], [at(0, 0), at(100, 0)]);
    expect(step.pan).toEqual([0, 0]);
    expect(step.zoom).toBe(1);
  });

  it('pans by how far the middle between the fingers moved', () => {
    const step = twoFingerStep([at(0, 0), at(100, 0)], [at(30, 10), at(130, 10)]);
    expect(step.pan).toEqual([30, 10]);
    expect(step.zoom).toBe(1);
  });

  it('zooms in (factor below 1) when the fingers spread apart', () => {
    const step = twoFingerStep([at(0, 0), at(100, 0)], [at(-50, 0), at(150, 0)]);
    expect(step.zoom).toBeCloseTo(0.5);
    expect(step.pan).toEqual([0, 0]);
  });

  it('zooms out (factor above 1) when the fingers pinch together', () => {
    const step = twoFingerStep([at(0, 0), at(200, 0)], [at(50, 0), at(150, 0)]);
    expect(step.zoom).toBeCloseTo(2);
  });

  it('copes with both fingers on the same spot', () => {
    const step = twoFingerStep([at(5, 5), at(5, 5)], [at(5, 5), at(50, 5)]);
    expect(Number.isFinite(step.zoom)).toBe(true);
    expect(step.zoom).toBe(1);
  });
});
