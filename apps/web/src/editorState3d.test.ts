import { addShape, canUndo, createEmptyDesign, translationOf, type Design } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer, type EditorAction, type EditorState } from './editorState.ts';

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);

function selectedBox(): EditorState {
  let d: Design = createEmptyDesign('d');
  d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
  d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
  return run(createEditorState(d), { type: 'pick', id: 'a', additive: false, phase: 'down' });
}

const design = (s: EditorState) => s.history.present;
const pos = (s: EditorState, id: string) => translationOf(design(s).nodes[id]!.transform);
const size = (s: EditorState, id: string) => {
  const n = design(s).nodes[id]!;
  return n.kind === 'shape' ? n.params : {};
};

const bigger = { x: 10, y: 10, z: 0, width: 40, depth: 40, height: 20 };
const taller = { x: 10, y: 10, z: 0, width: 40, depth: 40, height: 60 };

describe('handle drags (setGeometry)', () => {
  it('previews live and commits the whole drag as one undo step', () => {
    let s = selectedBox();
    s = run(s, { type: 'moveStart' }, { type: 'setGeometry', id: 'a', geometry: bigger }, { type: 'setGeometry', id: 'a', geometry: taller });
    expect(size(s, 'a')).toEqual({ width: 40, depth: 40, height: 60 });
    expect(canUndo(s.history)).toBe(false);

    s = run(s, { type: 'moveEnd' });
    expect(s.history.past).toHaveLength(1);
    s = run(s, { type: 'undo' });
    expect(size(s, 'a')).toEqual({ width: 20, depth: 20, height: 20 });
    expect(pos(s, 'a')).toEqual([0, 0, 0]);
  });

  it('updates position as well as size', () => {
    const s = run(selectedBox(), { type: 'moveStart' }, { type: 'setGeometry', id: 'a', geometry: bigger });
    expect(pos(s, 'a')).toEqual([10, 10, 0]);
  });

  it('is relative to the design the drag began from, not the previous preview', () => {
    let s = run(selectedBox(), { type: 'moveStart' }, { type: 'setGeometry', id: 'a', geometry: bigger });
    s = run(s, { type: 'setGeometry', id: 'a', geometry: { ...bigger, width: 25 } });
    expect(size(s, 'a')).toMatchObject({ width: 25, depth: 40 });
  });

  it('ignores geometry for a drag that was never started', () => {
    const before = selectedBox();
    expect(run(before, { type: 'setGeometry', id: 'a', geometry: bigger })).toBe(before);
  });

  it('ignores geometry for a shape that is not the one being dragged', () => {
    const s = run(selectedBox(), { type: 'moveStart' });
    expect(run(s, { type: 'setGeometry', id: 'b', geometry: bigger })).toBe(s);
  });

  it('keeps the original when an invalid geometry is previewed', () => {
    const s = run(selectedBox(), { type: 'moveStart' }, { type: 'setGeometry', id: 'a', geometry: { ...bigger, width: -1 } });
    expect(size(s, 'a')).toEqual({ width: 20, depth: 20, height: 20 });
  });

  it('records nothing when the drag ends where it started', () => {
    const start = { x: 0, y: 0, z: 0, width: 20, depth: 20, height: 20 };
    const s = run(selectedBox(), { type: 'moveStart' }, { type: 'setGeometry', id: 'a', geometry: bigger }, { type: 'setGeometry', id: 'a', geometry: start }, { type: 'moveEnd' });
    expect(canUndo(s.history)).toBe(false);
  });
});

describe('dropToPlane', () => {
  it('lowers the selected shapes onto the workplane as one step', () => {
    let s = run(selectedBox(), { type: 'setPosition', id: 'a', at: [3, 4, 25] });
    expect(pos(s, 'a')).toEqual([3, 4, 25]);
    s = run(s, { type: 'dropToPlane' });
    expect(pos(s, 'a')).toEqual([3, 4, 0]);
    expect(pos(run(s, { type: 'undo' }), 'a')).toEqual([3, 4, 25]);
  });

  it('does nothing when already on the workplane, or with nothing selected', () => {
    const s = selectedBox();
    expect(run(s, { type: 'dropToPlane' })).toBe(s);
    const none = run(s, { type: 'clearSelection' });
    expect(run(none, { type: 'dropToPlane' })).toBe(none);
  });
});

describe('setPosition with a height', () => {
  it('sets Z, and rejects a negative Z', () => {
    const s = run(selectedBox(), { type: 'setPosition', id: 'a', at: [0, 0, 12] });
    expect(pos(s, 'a')).toEqual([0, 0, 12]);
    expect(run(s, { type: 'setPosition', id: 'a', at: [0, 0, -3] })).toBe(s);
  });
});
