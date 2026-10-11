import { addShape, canUndo, createEmptyDesign, eulerOfTransform, eulerToMatrix, type Design } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer, type EditorAction, type EditorState } from './editorState.ts';

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);

function selectedBox(): EditorState {
  let d: Design = createEmptyDesign('d');
  d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
  d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
  return run(createEditorState(d), { type: 'pick', id: 'a', additive: false, phase: 'down' });
}

const euler = (s: EditorState, id: string) => eulerOfTransform(s.history.present.nodes[id]!.transform);

function close(actual: readonly number[], expected: readonly number[]) {
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 6));
}

describe('ring drags (setRotation)', () => {
  it('previews live and commits the whole drag as one undo step', () => {
    let s = selectedBox();
    s = run(
      s,
      { type: 'moveStart' },
      { type: 'setRotation', id: 'a', rotation: eulerToMatrix([0, 0, 22.5]) },
      { type: 'setRotation', id: 'a', rotation: eulerToMatrix([0, 0, 45]) },
    );
    close(euler(s, 'a'), [0, 0, 45]);
    expect(canUndo(s.history)).toBe(false);

    s = run(s, { type: 'moveEnd' });
    expect(s.history.past).toHaveLength(1);
    close(euler(run(s, { type: 'undo' }), 'a'), [0, 0, 0]);
  });

  it('is relative to where the drag began, not the previous preview', () => {
    const s = run(
      selectedBox(),
      { type: 'moveStart' },
      { type: 'setRotation', id: 'a', rotation: eulerToMatrix([0, 0, 90]) },
      { type: 'setRotation', id: 'a', rotation: eulerToMatrix([0, 0, 10]) },
    );
    close(euler(s, 'a'), [0, 0, 10]);
  });

  it('ignores rotation for a drag that was never started or for a different shape', () => {
    const before = selectedBox();
    expect(run(before, { type: 'setRotation', id: 'a', rotation: eulerToMatrix([0, 0, 45]) })).toBe(before);
    const dragging = run(before, { type: 'moveStart' });
    expect(run(dragging, { type: 'setRotation', id: 'b', rotation: eulerToMatrix([0, 0, 45]) })).toBe(dragging);
  });

  it('records nothing when the ring is dragged back to where it started', () => {
    const s = run(
      selectedBox(),
      { type: 'moveStart' },
      { type: 'setRotation', id: 'a', rotation: eulerToMatrix([0, 0, 45]) },
      { type: 'setRotation', id: 'a', rotation: eulerToMatrix([0, 0, 0]) },
      { type: 'moveEnd' },
    );
    expect(canUndo(s.history)).toBe(false);
  });
});

describe('setEuler (typed rotation)', () => {
  it('rotates the shape as one undoable step', () => {
    let s = run(selectedBox(), { type: 'setEuler', id: 'a', euler: [10, 20, 30] });
    close(euler(s, 'a'), [10, 20, 30]);
    s = run(s, { type: 'undo' });
    close(euler(s, 'a'), [0, 0, 0]);
  });

  it('ignores invalid angles and no-op changes without recording a step', () => {
    const s = selectedBox();
    expect(run(s, { type: 'setEuler', id: 'a', euler: [Number.NaN, 0, 0] })).toBe(s);
    expect(run(s, { type: 'setEuler', id: 'a', euler: [0, 0, 0] })).toBe(s);
  });

  it('duplicates keep the rotation', () => {
    const s = run(selectedBox(), { type: 'setEuler', id: 'a', euler: [0, 0, 33] }, { type: 'duplicate' });
    close(euler(s, s.selection[0]!), [0, 0, 33]);
  });
});
