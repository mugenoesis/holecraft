import { describe, expect, it } from 'vitest';
import { HANDLE_IDS, dragHandle, handlePosition, type ShapeGeometry } from './resize.ts';
import { MAX_SHAPE_SIZE } from './edit.ts';

const unit: ShapeGeometry = { x: 0, y: 0, z: 0, width: 20, depth: 20, height: 20 };
const off = { snap: 0, uniform: false, fromCenter: false };

describe('handlePosition', () => {
  it('puts corner handles on the base corners', () => {
    expect(handlePosition(unit, 'corner-pp')).toEqual([10, 10, 0]);
    expect(handlePosition(unit, 'corner-nn')).toEqual([-10, -10, 0]);
    expect(handlePosition(unit, 'corner-pn')).toEqual([10, -10, 0]);
    expect(handlePosition(unit, 'corner-np')).toEqual([-10, 10, 0]);
  });

  it('puts side handles at the middle of each base edge', () => {
    expect(handlePosition(unit, 'side-px')).toEqual([10, 0, 0]);
    expect(handlePosition(unit, 'side-nx')).toEqual([-10, 0, 0]);
    expect(handlePosition(unit, 'side-py')).toEqual([0, 10, 0]);
    expect(handlePosition(unit, 'side-ny')).toEqual([0, -10, 0]);
  });

  it('puts the height and lift handles above the top face', () => {
    const g = { ...unit, x: 5, y: -5, z: 10 };
    expect(handlePosition(g, 'height')).toEqual([5, -5, 30]);
    expect(handlePosition(g, 'lift')).toEqual([5, -5, 30]);
  });

  it('follows the shape when it moves or grows', () => {
    const g = { x: 50, y: 0, z: 0, width: 40, depth: 10, height: 5 };
    expect(handlePosition(g, 'corner-pp')).toEqual([70, 5, 0]);
  });

  it('has an id for every handle', () => {
    expect(HANDLE_IDS).toHaveLength(10);
    expect(new Set(HANDLE_IDS).size).toBe(10);
  });
});

describe('dragHandle: corners', () => {
  it('keeps the opposite corner fixed and moves the dragged one', () => {
    const g = dragHandle(unit, 'corner-pp', [30, 40, 0], off);
    expect(g).toEqual({ x: 10, y: 15, z: 0, width: 40, depth: 50, height: 20 });
  });

  it('works from every corner', () => {
    expect(dragHandle(unit, 'corner-nn', [-30, -10, 0], off)).toMatchObject({ x: -10, y: 0, width: 40, depth: 20 });
    expect(dragHandle(unit, 'corner-pn', [20, -20, 0], off)).toMatchObject({ x: 5, y: -5, width: 30, depth: 30 });
    expect(dragHandle(unit, 'corner-np', [-20, 20, 0], off)).toMatchObject({ x: -5, y: 5, width: 30, depth: 30 });
  });

  it('shrinks too', () => {
    expect(dragHandle(unit, 'corner-pp', [0, 0, 0], off)).toMatchObject({ x: -5, y: -5, width: 10, depth: 10 });
  });

  it('snaps the dragged edge to the grid, not the size', () => {
    const g = dragHandle(unit, 'corner-pp', [31, 38, 0], { ...off, snap: 5 });
    expect(g).toMatchObject({ width: 40, depth: 50, x: 10, y: 15 });
  });

  it('never flips or collapses past the fixed corner', () => {
    const g = dragHandle(unit, 'corner-pp', [-50, -50, 0], off);
    expect(g.width).toBeGreaterThan(0);
    expect(g.depth).toBeGreaterThan(0);
    expect(g.x).toBeCloseTo(-10 + g.width / 2, 6);
  });

  it('resizes from the centre when asked', () => {
    const g = dragHandle(unit, 'corner-pp', [30, 15, 0], { ...off, fromCenter: true });
    expect(g).toEqual({ x: 0, y: 0, z: 0, width: 60, depth: 30, height: 20 });
  });

  it('scales all three dimensions together when uniform', () => {
    const g = dragHandle(unit, 'corner-pp', [30, 10, 0], { ...off, uniform: true });
    // The width wants to double, so depth and height double with it; the far corner stays put.
    expect(g).toEqual({ x: 10, y: 10, z: 0, width: 40, depth: 40, height: 40 });
  });

  it('uniform scaling keeps the base height z', () => {
    const g = dragHandle({ ...unit, z: 7 }, 'corner-pp', [30, 10, 0], { ...off, uniform: true });
    expect(g.z).toBe(7);
  });

  it('refuses to grow past the maximum size', () => {
    const g = dragHandle(unit, 'corner-pp', [1e6, 1e6, 0], off);
    expect(g.width).toBeLessThanOrEqual(MAX_SHAPE_SIZE);
    expect(g.depth).toBeLessThanOrEqual(MAX_SHAPE_SIZE);
  });
});

describe('dragHandle: sides', () => {
  it('changes only the dragged dimension', () => {
    const g = dragHandle(unit, 'side-px', [25, 99, 99], off);
    expect(g).toEqual({ x: 7.5, y: 0, z: 0, width: 35, depth: 20, height: 20 });
  });

  it('keeps the opposite side fixed for each direction', () => {
    expect(dragHandle(unit, 'side-nx', [-30, 0, 0], off)).toMatchObject({ x: -10, width: 40 });
    expect(dragHandle(unit, 'side-py', [0, 30, 0], off)).toMatchObject({ y: 10, depth: 40 });
    expect(dragHandle(unit, 'side-ny', [0, -30, 0], off)).toMatchObject({ y: -10, depth: 40 });
  });

  it('resizes symmetrically from the centre when asked', () => {
    const g = dragHandle(unit, 'side-px', [25, 0, 0], { ...off, fromCenter: true });
    expect(g).toMatchObject({ x: 0, width: 50 });
  });

  it('snaps the dragged side', () => {
    expect(dragHandle(unit, 'side-px', [23, 0, 0], { ...off, snap: 5 })).toMatchObject({ width: 35 });
  });

  it('cannot be dragged through the opposite side', () => {
    const g = dragHandle(unit, 'side-px', [-40, 0, 0], off);
    expect(g.width).toBeGreaterThan(0);
    expect(g.x - g.width / 2).toBeCloseTo(-10, 6);
  });
});

describe('dragHandle: height and lift', () => {
  const raised: ShapeGeometry = { x: 0, y: 0, z: 5, width: 20, depth: 20, height: 20 };

  it('moves the top face, keeping the base where it is', () => {
    expect(dragHandle(raised, 'height', [0, 0, 35], off)).toEqual({ ...raised, height: 30 });
  });

  it('snaps the top face to the grid', () => {
    expect(dragHandle(raised, 'height', [0, 0, 33], { ...off, snap: 5 }).height).toBe(30);
  });

  it('never goes flat or inverted', () => {
    const g = dragHandle(raised, 'height', [0, 0, -50], off);
    expect(g.height).toBeGreaterThan(0);
    expect(g.z).toBe(5);
  });

  it('scales the footprint about the centre when uniform', () => {
    const g = dragHandle(raised, 'height', [0, 0, 45], { ...off, uniform: true });
    expect(g).toEqual({ x: 0, y: 0, z: 5, width: 40, depth: 40, height: 40 });
  });

  it('lifts the whole shape so its top follows the handle', () => {
    expect(dragHandle(unit, 'lift', [0, 0, 50], off)).toEqual({ ...unit, z: 30 });
  });

  it('snaps the resulting height above the workplane', () => {
    expect(dragHandle(unit, 'lift', [0, 0, 47], { ...off, snap: 5 }).z).toBe(25);
  });

  it('cannot sink below the workplane', () => {
    expect(dragHandle(unit, 'lift', [0, 0, -100], off).z).toBe(0);
  });

  it('only changes z, never size or position', () => {
    const g = dragHandle({ ...unit, x: 3, y: 4 }, 'lift', [99, 99, 40], off);
    expect(g).toMatchObject({ x: 3, y: 4, width: 20, depth: 20, height: 20 });
  });
});

describe('dragHandle: numeric hygiene', () => {
  it('does not leak float noise', () => {
    const g = dragHandle(unit, 'corner-pp', [10.1 + 0.2, 10.3, 0], { ...off, snap: 0.1 });
    expect(g.width).toBe(20.3);
    expect(g.x).toBe(0.15);
  });

  it('leaves the input untouched', () => {
    const start = { ...unit };
    dragHandle(start, 'corner-pp', [30, 30, 0], off);
    expect(start).toEqual(unit);
  });
});
