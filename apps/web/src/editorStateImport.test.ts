import { canUndo, createEmptyDesign, shapeBounds } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const input = { name: 'Bracket', ref: 'a'.repeat(64), size: [10, 20, 30] as [number, number, number] };

describe('adding an imported model', () => {
  it('adds it to the design and selects it', () => {
    const s = editorReducer(createEditorState(createEmptyDesign('d')), { type: 'addMesh', input });
    const id = s.history.present.roots[0]!;
    expect(s.history.present.nodes[id]).toMatchObject({ name: 'Bracket', shapeType: 'mesh' });
    expect(s.selection).toEqual([id]);
  });

  it('is one undo step', () => {
    let s = editorReducer(createEditorState(createEmptyDesign('d')), { type: 'addMesh', input });
    expect(canUndo(s.history)).toBe(true);
    s = editorReducer(s, { type: 'undo' });
    expect(s.history.present.roots).toEqual([]);
  });

  it('puts it where it is asked to, resting on the workplane', () => {
    const s = editorReducer(createEditorState(createEmptyDesign('d')), { type: 'addMesh', input, at: [40, -20] });
    const node = s.history.present.nodes[s.history.present.roots[0]!]!;
    const bounds = shapeBounds(node as never);
    expect(bounds.min[2]).toBe(0);
    expect((bounds.min[0] + bounds.max[0]) / 2).toBe(40);
  });
});
