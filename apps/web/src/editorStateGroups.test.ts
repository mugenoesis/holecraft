import { addShape, canUndo, createEmptyDesign, translationOf, type Design, type GroupNode } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer, type EditorAction, type EditorState } from './editorState.ts';

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);

function threeShapes(): EditorState {
  let d: Design = createEmptyDesign('d');
  d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
  d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
  d = addShape(d, 'cylinder', [0, 50], { id: 'c' }).design;
  return createEditorState(d);
}

const design = (s: EditorState) => s.history.present;
const pick = (id: string, additive = false): EditorAction => ({ type: 'pick', id, additive, phase: 'down' });

describe('group', () => {
  it('groups the selection into one node and selects it', () => {
    const s = run(threeShapes(), pick('a'), pick('b', true), { type: 'group' });
    expect(design(s).roots).toHaveLength(2);
    expect(s.selection).toHaveLength(1);
    const g = design(s).nodes[s.selection[0]!] as GroupNode;
    expect(g.kind).toBe('group');
    expect(g.children).toEqual(['a', 'b']);
  });

  it('is one undo step, and undo restores the loose shapes', () => {
    let s = run(threeShapes(), { type: 'selectAll' }, { type: 'group' });
    expect(s.history.past).toHaveLength(1);
    s = run(s, { type: 'undo' });
    expect(design(s).roots).toEqual(['a', 'b', 'c']);
    expect(s.selection).toEqual([]);
  });

  it('does nothing with fewer than two shapes selected', () => {
    const one = run(threeShapes(), pick('a'));
    expect(run(one, { type: 'group' })).toBe(one);
    const none = threeShapes();
    expect(run(none, { type: 'group' })).toBe(none);
  });

  it('groups groups', () => {
    const s = run(threeShapes(), pick('a'), pick('b', true), { type: 'group' });
    const inner = s.selection[0]!;
    const nested = run(s, pick(inner), pick('c', true), { type: 'group' });
    expect(design(nested).roots).toHaveLength(1);
  });
});

describe('ungroup', () => {
  const grouped = () => run(threeShapes(), pick('a'), pick('b', true), { type: 'group' });

  it('frees the children and selects them', () => {
    const s = run(grouped(), { type: 'ungroup' });
    expect(design(s).roots).toEqual(['a', 'b', 'c']);
    expect(s.selection).toEqual(['a', 'b']);
  });

  it('is one undo step, and undo brings the group back', () => {
    let s = run(grouped(), { type: 'ungroup' });
    s = run(s, { type: 'undo' });
    expect(design(s).roots).toHaveLength(2);
    expect(Object.values(design(s).nodes).some((n) => n.kind === 'group')).toBe(true);
  });

  it('does nothing when no group is selected', () => {
    const s = run(threeShapes(), pick('a'));
    expect(run(s, { type: 'ungroup' })).toBe(s);
  });

  it('only dissolves the groups in a mixed selection', () => {
    const g = grouped();
    const s = run(g, pick(g.selection[0]!), pick('c', true), { type: 'ungroup' });
    expect(design(s).roots).toEqual(['a', 'b', 'c']);
    expect(s.selection).toEqual(['a', 'b']);
  });
});

describe('moving, deleting and duplicating groups', () => {
  const grouped = () => run(threeShapes(), pick('a'), pick('b', true), { type: 'group' });

  it('dragging a group moves it as a unit, in one undo step', () => {
    let s = run(grouped(), { type: 'moveStart' }, { type: 'move', delta: [10, 0] }, { type: 'moveEnd' });
    const g = design(s).nodes[s.selection[0]!]!;
    // The group's centre was at x = 25, so it lands on 35: a shift of 10.
    expect(translationOf(g.transform)[0]).toBe(10);
    expect(translationOf(design(s).nodes.a!.transform)[0]).toBe(0);
    s = run(s, { type: 'undo' });
    expect(translationOf(design(s).nodes[s.selection[0]!]!.transform)[0]).toBe(0);
  });

  it('deleting a group removes its children, and undo restores them', () => {
    let s = run(grouped(), { type: 'delete' });
    expect(design(s).roots).toEqual(['c']);
    expect(design(s).nodes.a).toBeUndefined();
    s = run(s, { type: 'undo' });
    expect(design(s).nodes.a).toBeDefined();
    expect(design(s).roots).toHaveLength(2);
  });

  it('duplicating a group selects the copy', () => {
    const s = run(grouped(), { type: 'duplicate' });
    expect(design(s).roots).toHaveLength(3);
    expect(s.selection).toHaveLength(1);
    expect((design(s).nodes[s.selection[0]!] as GroupNode).children).toHaveLength(2);
  });

  it('nudging a group moves it', () => {
    const s = run(grouped(), { type: 'nudge', delta: [0, 5] });
    expect(translationOf(design(s).nodes[s.selection[0]!]!.transform)).toEqual([0, 5, 0]);
  });
});

describe('setMode', () => {
  it('turns the selection into holes, and back, as separate undo steps', () => {
    let s = run(threeShapes(), pick('a'), { type: 'setMode', mode: 'hole' });
    expect(design(s).nodes.a!.mode).toBe('hole');
    s = run(s, { type: 'setMode', mode: 'solid' });
    expect(design(s).nodes.a!.mode).toBe('solid');
    expect(s.history.past).toHaveLength(2);
  });

  it('applies to everything selected', () => {
    const s = run(threeShapes(), { type: 'selectAll' }, { type: 'setMode', mode: 'hole' });
    expect(['a', 'b', 'c'].map((id) => design(s).nodes[id]!.mode)).toEqual(['hole', 'hole', 'hole']);
  });

  it('does nothing when already in that mode, or with nothing selected', () => {
    const one = run(threeShapes(), pick('a'));
    expect(run(one, { type: 'setMode', mode: 'solid' })).toBe(one);
    const none = threeShapes();
    expect(run(none, { type: 'setMode', mode: 'hole' })).toBe(none);
    expect(canUndo(run(one, { type: 'setMode', mode: 'solid' }).history)).toBe(false);
  });
});
