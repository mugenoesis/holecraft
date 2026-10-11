import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type GroupNode } from './design.ts';
import {
  deleteNodes,
  dropToWorkplane,
  duplicateNodes,
  moveNodes,
  moveSelection,
  selectAll,
  setNodeColor,
  setNodeMode,
} from './edit.ts';
import { groupNodes } from './groups.ts';
import { addShape, nodeBoundsIn, translationOf } from './ops.ts';

function grouped(): Design {
  let d = createEmptyDesign('d');
  d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
  d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
  d = addShape(d, 'cylinder', [0, 50], { id: 'c' }).design;
  return groupNodes(d, ['a', 'b'], { id: 'g' }).design;
}

const g = (d: Design) => d.nodes.g as GroupNode;
const pos = (d: Design, id: string) => translationOf(d.nodes[id]!.transform);

describe('deleteNodes with groups', () => {
  it('deletes a group and everything inside it', () => {
    const d = deleteNodes(grouped(), ['g']);
    expect(d.roots).toEqual(['c']);
    expect(Object.keys(d.nodes)).toEqual(['c']);
  });

  it('deletes nested groups completely', () => {
    const nested = groupNodes(grouped(), ['g', 'c'], { id: 'outer' }).design;
    expect(deleteNodes(nested, ['outer']).nodes).toEqual({});
  });
});

describe('duplicateNodes with groups', () => {
  it('copies a group deeply, with fresh ids, offset as a whole', () => {
    const { design, ids } = duplicateNodes(grouped(), ['g'], [10, 20]);
    expect(ids).toHaveLength(1);
    const copy = design.nodes[ids[0]!] as GroupNode;
    expect(copy.kind).toBe('group');
    expect(copy.name).toBe('Group 2');
    expect(copy.children).toHaveLength(2);
    expect(copy.children.every((c) => !['a', 'b', 'c'].includes(c))).toBe(true);
    expect(pos(design, copy.id)).toEqual([10, 20, 0]);
    // The original children are untouched.
    expect(pos(design, 'a')).toEqual([0, 0, 0]);
  });

  it('keeps modes and sizes inside the copy', () => {
    const d = setNodeMode(grouped(), ['b'], 'hole');
    const { design, ids } = duplicateNodes(d, ['g'], [0, 0]);
    const kids = (design.nodes[ids[0]!] as GroupNode).children.map((c) => design.nodes[c]!);
    expect(kids.map((k) => k.mode)).toEqual(['solid', 'hole']);
  });

  it('copies are independent of the original', () => {
    const { design, ids } = duplicateNodes(grouped(), ['g'], [0, 0]);
    const kidId = (design.nodes[ids[0]!] as GroupNode).children[0]!;
    design.nodes[kidId]!.transform[12] = 99;
    expect(pos(design, 'a')[0]).toBe(0);
  });

  it('puts the copy at the top level', () => {
    const { design, ids } = duplicateNodes(grouped(), ['g'], [0, 0]);
    expect(design.roots).toEqual(['g', 'c', ids[0]]);
  });
});

describe('setNodeColor with groups', () => {
  it('recolours everything inside a group', () => {
    const d = setNodeColor(grouped(), ['g'], '#abcdef');
    expect(d.nodes.a!.color).toBe('#abcdef');
    expect(d.nodes.b!.color).toBe('#abcdef');
    expect(g(d).color).toBe('#abcdef');
    expect(d.nodes.c!.color).not.toBe('#abcdef');
  });

  it('returns the same design when everything already has that colour', () => {
    const d = setNodeColor(grouped(), ['g'], '#abcdef');
    expect(setNodeColor(d, ['g'], '#abcdef')).toBe(d);
  });
});

describe('setNodeMode', () => {
  it('turns shapes into holes and back', () => {
    const hole = setNodeMode(grouped(), ['c'], 'hole');
    expect(hole.nodes.c!.mode).toBe('hole');
    expect(setNodeMode(hole, ['c'], 'solid').nodes.c!.mode).toBe('solid');
  });

  it('applies to every given node, groups included', () => {
    const d = setNodeMode(grouped(), ['g', 'c'], 'hole');
    expect(g(d).mode).toBe('hole');
    expect(d.nodes.c!.mode).toBe('hole');
  });

  it('keeps the colour so toggling back restores it', () => {
    const before = grouped().nodes.c!.color;
    const there = setNodeMode(grouped(), ['c'], 'hole');
    expect(there.nodes.c!.color).toBe(before);
  });

  it('returns the same design when nothing changes, and skips locked or unknown nodes', () => {
    const d = grouped();
    expect(setNodeMode(d, ['c'], 'solid')).toBe(d);
    expect(setNodeMode(d, ['nope'], 'hole')).toBe(d);
    d.nodes.c!.locked = true;
    expect(setNodeMode(d, ['c'], 'hole')).toBe(d);
  });
});

describe('moving groups', () => {
  it('moves the group as a unit without touching the children', () => {
    const d = moveNodes(grouped(), ['g'], [10, 5, 0]);
    expect(pos(d, 'g')).toEqual([10, 5, 0]);
    expect(pos(d, 'a')).toEqual([0, 0, 0]);
    expect(nodeBoundsIn(d, 'g')!.min).toEqual([0, -5, 0]);
  });

  it('drag-moves a group by its centre, snapped and kept on the workplane', () => {
    // Group bounds are x −10..60, y −10..10, so its centre is (25, 0).
    const opts = { snap: 5, size: [200, 200] as [number, number] };
    const d = moveSelection(grouped(), ['g'], [12, 3], opts);
    // The centre (25, 0) wants to go to (37, 3), which snaps to (35, 5): a move of (10, 5).
    expect(pos(d, 'g')).toEqual([10, 5, 0]);
  });

  it('keeps a group on the workplane by its centre, wherever its own origin is', () => {
    const opts = { snap: 0, size: [200, 200] as [number, number] };
    const d = moveSelection(grouped(), ['g'], [500, 0], opts);
    const b = nodeBoundsIn(d, 'g')!;
    expect((b.min[0] + b.max[0]) / 2).toBe(100);
  });
});

describe('dropToWorkplane with groups', () => {
  it('lowers a floating group until its lowest solid rests on the plane', () => {
    const lifted = moveNodes(grouped(), ['g'], [0, 0, 30]);
    expect(nodeBoundsIn(lifted, 'g')!.min[2]).toBe(30);
    const dropped = dropToWorkplane(lifted, ['g']);
    expect(nodeBoundsIn(dropped, 'g')!.min[2]).toBe(0);
  });

  it('does nothing for a group already on the plane', () => {
    const d = grouped();
    expect(dropToWorkplane(d, ['g'])).toBe(d);
  });
});

describe('selectAll with groups', () => {
  it('selects top-level groups and shapes, not their children', () => {
    expect(selectAll(grouped())).toEqual(['g', 'c']);
  });
});
