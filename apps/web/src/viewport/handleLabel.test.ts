import { HANDLE_IDS } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { describeDrag, handleAriaLabel } from './handleLabel.ts';

const g = { x: 0, y: 0, z: 0, width: 20, depth: 30, height: 40 };

describe('describeDrag', () => {
  it('shows the size while resizing', () => {
    for (const id of ['corner-pp', 'corner-nn', 'side-px', 'side-ny', 'height'] as const) {
      expect(describeDrag(id, g)).toBe('20 × 30 × 40 mm');
    }
  });

  it('rounds to two decimals and drops trailing zeros', () => {
    expect(describeDrag('corner-pp', { ...g, width: 20.456, depth: 30.1, height: 40.004 })).toBe('20.46 × 30.1 × 40 mm');
  });

  it('shows the height above the workplane while lifting', () => {
    expect(describeDrag('lift', { ...g, z: 12.5 })).toBe('Z 12.5 mm');
    expect(describeDrag('lift', g)).toBe('Z 0 mm');
  });
});

describe('handleAriaLabel', () => {
  it('describes every handle distinctly', () => {
    const labels = HANDLE_IDS.map(handleAriaLabel);
    expect(new Set(labels).size).toBe(HANDLE_IDS.length);
  });

  it('says what each kind of handle does', () => {
    expect(handleAriaLabel('corner-pp')).toMatch(/resize/i);
    expect(handleAriaLabel('side-nx')).toMatch(/resize/i);
    expect(handleAriaLabel('height')).toMatch(/resize.*height/i);
    expect(handleAriaLabel('lift')).toMatch(/lift/i);
  });

  it('names the side or corner', () => {
    expect(handleAriaLabel('corner-pn')).toContain('+X');
    expect(handleAriaLabel('corner-pn')).toContain('-Y');
    expect(handleAriaLabel('side-ny')).toContain('-Y');
  });
});
