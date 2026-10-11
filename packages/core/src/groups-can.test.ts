import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design } from './design.ts';
import { canGroup, canUngroup, groupNodes } from './groups.ts';
import { addShape } from './ops.ts';

function scene(): Design {
  let d = createEmptyDesign('d');
  d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
  d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
  d = addShape(d, 'cylinder', [0, 50], { id: 'c' }).design;
  return d;
}

describe('canGroup', () => {
  it('needs two or more top-level nodes', () => {
    expect(canGroup(scene(), [])).toBe(false);
    expect(canGroup(scene(), ['a'])).toBe(false);
    expect(canGroup(scene(), ['a', 'b'])).toBe(true);
  });

  it('does not count locked, unknown or nested nodes', () => {
    const d = scene();
    d.nodes.a!.locked = true;
    expect(canGroup(d, ['a', 'b'])).toBe(false);
    expect(canGroup(d, ['b', 'nope'])).toBe(false);
    const grouped = groupNodes(scene(), ['a', 'b'], { id: 'g' }).design;
    expect(canGroup(grouped, ['a', 'b'])).toBe(false); // already inside g
    expect(canGroup(grouped, ['g', 'c'])).toBe(true);
  });

  it('agrees with what groupNodes will actually do', () => {
    const d = scene();
    for (const ids of [[], ['a'], ['a', 'b'], ['a', 'b', 'c'], ['a', 'x']]) {
      expect(canGroup(d, ids)).toBe(groupNodes(d, ids).id !== null);
    }
  });
});

describe('canUngroup', () => {
  it('is true when the selection includes a group', () => {
    const grouped = groupNodes(scene(), ['a', 'b'], { id: 'g' }).design;
    expect(canUngroup(grouped, ['g'])).toBe(true);
    expect(canUngroup(grouped, ['g', 'c'])).toBe(true);
  });

  it('is false for shapes only, nothing, or a locked group', () => {
    const grouped = groupNodes(scene(), ['a', 'b'], { id: 'g' }).design;
    expect(canUngroup(grouped, ['c'])).toBe(false);
    expect(canUngroup(grouped, [])).toBe(false);
    grouped.nodes.g!.locked = true;
    expect(canUngroup(grouped, ['g'])).toBe(false);
  });
});
