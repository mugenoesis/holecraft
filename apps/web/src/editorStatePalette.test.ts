import { addShape, canUndo, createEmptyDesign, DEFAULT_PALETTE, MAX_PALETTE_SIZE } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer, type EditorAction } from './editorState.ts';

const start = () => {
  let d = createEmptyDesign('d');
  d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
  return createEditorState(d);
};
const run = (...actions: EditorAction[]) => actions.reduce(editorReducer, start());
const palette = (s: ReturnType<typeof start>) => s.history.present.palette;

describe('palette actions', () => {
  it('adds a colour, as one undo step', () => {
    let s = run({ type: 'paletteAdd', color: '#112233' });
    expect(palette(s)).toEqual([...DEFAULT_PALETTE, '#112233']);
    expect(canUndo(s.history)).toBe(true);
    s = editorReducer(s, { type: 'undo' });
    expect(palette(s)).toEqual([...DEFAULT_PALETTE]);
  });

  it('adds a suggested colour when none is given, distinct from the ones already there', () => {
    const s = run({ type: 'paletteAdd' });
    expect(palette(s)).toHaveLength(DEFAULT_PALETTE.length + 1);
    expect(new Set(palette(s)).size).toBe(palette(s).length);
  });

  it('keeps adding distinct colours up to the limit', () => {
    let s = start();
    for (let i = 0; i < 30; i++) s = editorReducer(s, { type: 'paletteAdd' });
    expect(palette(s)).toHaveLength(MAX_PALETTE_SIZE);
    expect(new Set(palette(s)).size).toBe(MAX_PALETTE_SIZE);
  });

  it('changes a slot and the shapes using it together, and undoes both together', () => {
    const before = start().history.present.nodes.a!.color; // the box's default colour is slot 1
    expect(before).toBe(DEFAULT_PALETTE[0]);
    let s = run({ type: 'paletteSet', slot: 0, color: '#102030' });
    expect(palette(s)[0]).toBe('#102030');
    expect(s.history.present.nodes.a!.color).toBe('#102030');
    s = editorReducer(s, { type: 'undo' });
    expect(palette(s)[0]).toBe(before);
    expect(s.history.present.nodes.a!.color).toBe(before);
  });

  it('removes a slot', () => {
    const s = run({ type: 'paletteRemove', slot: 1 });
    expect(palette(s)).toHaveLength(DEFAULT_PALETTE.length - 1);
  });

  it('does not record a step when nothing changes', () => {
    const s = run({ type: 'paletteSet', slot: 0, color: DEFAULT_PALETTE[0]! }, { type: 'paletteRemove', slot: 9 });
    expect(canUndo(s.history)).toBe(false);
  });
});
