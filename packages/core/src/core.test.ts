import { describe, expect, it } from 'vitest';
import { DESIGN_FORMAT_VERSION, DEFAULT_GRID, createEmptyDesign, mmToUnits, newId, snapToGrid, unitsToMm } from './index.ts';

describe('snapToGrid', () => {
  it('rounds to the nearest step', () => {
    expect(snapToGrid(12.4, 1)).toBe(12);
    expect(snapToGrid(12.6, 1)).toBe(13);
    expect(snapToGrid(-7.4, 5)).toBe(-5);
  });

  it('trims float noise on fractional steps', () => {
    expect(snapToGrid(0.31, 0.1)).toBe(0.3);
    expect(snapToGrid(0.62, 0.25)).toBe(0.5);
  });

  it('returns the value unchanged when snapping is off', () => {
    expect(snapToGrid(3.14159, 0)).toBe(3.14159);
  });
});

describe('createEmptyDesign', () => {
  it('creates a versioned, empty mm design', () => {
    const now = new Date('2026-10-11T12:00:00Z');
    const d = createEmptyDesign('abc', 'Bracket', now);
    expect(d).toMatchObject({
      formatVersion: DESIGN_FORMAT_VERSION,
      id: 'abc',
      name: 'Bracket',
      units: 'mm',
      nodes: {},
      roots: [],
      createdAt: '2026-10-11T12:00:00.000Z',
    });
  });

  it('does not share grid state with the defaults', () => {
    const d = createEmptyDesign('a');
    d.grid.size[0] = 500;
    expect(DEFAULT_GRID.size[0]).toBe(200);
  });
});

describe('units', () => {
  it('round-trips inches', () => {
    expect(unitsToMm(1, 'in')).toBe(25.4);
    expect(mmToUnits(50.8, 'in')).toBe(2);
    expect(mmToUnits(10, 'mm')).toBe(10);
  });
});

describe('newId', () => {
  it('produces unique 32-char hex ids', () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newId()).not.toBe(a);
  });
});
