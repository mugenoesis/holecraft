import { descendantIds, eulerOfTransform, isUpright, rotationOfTransform, translationOf, type Design, type NodeId } from '@holecraft/core';
import { useEffect, useState, type Dispatch, type FocusEvent, type KeyboardEvent } from 'react';
import type { EditorAction } from './editorState.ts';

const fmt = (n: number) => String(Number(n.toFixed(2)));

interface Props {
  design: Design;
  selection: readonly NodeId[];
  dispatch: Dispatch<EditorAction>;
}

export function PropertiesPanel({ design, selection, dispatch }: Props) {
  const nodes = selection.flatMap((id) => (design.nodes[id] ? [design.nodes[id]] : []));

  if (nodes.length === 0) {
    return (
      <section aria-label="Properties">
        <h2>Properties</h2>
        <p className="muted">Select a shape to edit its properties.</p>
      </section>
    );
  }

  const actions = (
    <div className="button-row">
      <button type="button" onClick={() => dispatch({ type: 'duplicate' })} title="Duplicate (Ctrl+D)">
        Duplicate
      </button>
      <button type="button" onClick={() => dispatch({ type: 'dropToPlane' })} title="Drop to workplane (D)">
        Drop to workplane
      </button>
      <button type="button" onClick={() => dispatch({ type: 'delete' })} title="Delete (Delete)">
        Delete
      </button>
    </div>
  );

  const color = (
    <label className="field">
      <span>Color</span>
      <input
        type="color"
        value={nodes[0]!.color}
        onChange={(e) => dispatch({ type: 'setColor', ids: nodes.map((n) => n.id), color: e.target.value })}
      />
    </label>
  );

  // Solid or hole. Neither button is pressed when the selection is a mix.
  const modes = new Set(nodes.map((n) => n.mode));
  const typeToggle = (
    <div className="field">
      <span>Type</span>
      <div className="segmented" role="group" aria-label="Type">
        {(['solid', 'hole'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={modes.size === 1 && modes.has(mode)}
            onClick={() => dispatch({ type: 'setMode', mode })}
            title={mode === 'hole' ? 'Cut this shape out of anything it overlaps in its group' : 'Add this shape to the model'}
          >
            {mode === 'solid' ? 'Solid' : 'Hole'}
          </button>
        ))}
      </div>
    </div>
  );

  const only = nodes.length === 1 ? nodes[0]! : null;

  if (!only) {
    return (
      <section aria-label="Properties">
        <h2>Properties</h2>
        <p>{nodes.length} shapes selected</p>
        {typeToggle}
        {color}
        {actions}
      </section>
    );
  }

  if (only.kind === 'group') {
    const shapes = descendantIds(design, only.id).filter((id) => design.nodes[id]?.kind === 'shape').length;
    return (
      <section aria-label="Properties">
        <h2>Properties</h2>
        <div key={only.id} className="fields">
          <TextField label="Name" value={only.name} onCommit={(name) => dispatch({ type: 'rename', id: only.id, name })} />
        </div>
        <p>Contains {shapes} shapes</p>
        {typeToggle}
        {color}
        {actions}
      </section>
    );
  }

  const [x, y, z] = translationOf(only.transform);
  const euler = eulerOfTransform(only.transform);
  const tilted = !isUpright(rotationOfTransform(only.transform));
  const turn = (axis: 0 | 1 | 2) => (v: number) => {
    const next: [number, number, number] = [...euler];
    next[axis] = v;
    dispatch({ type: 'setEuler', id: only.id, euler: next });
  };
  const size = only.kind === 'shape' ? (only.params as { width: number; depth: number; height: number }) : null;

  return (
    <section aria-label="Properties">
      <h2>Properties</h2>
      {/* Keyed by id so half-typed values never leak from one shape to another. */}
      <div key={only.id} className="fields">
        <TextField label="Name" value={only.name} onCommit={(name) => dispatch({ type: 'rename', id: only.id, name })} />
        <NumberField label="X" value={x} onCommit={(v) => dispatch({ type: 'setPosition', id: only.id, at: [v, y] })} />
        <NumberField label="Y" value={y} onCommit={(v) => dispatch({ type: 'setPosition', id: only.id, at: [x, v] })} />
        <NumberField label="Z" value={z} onCommit={(v) => dispatch({ type: 'setPosition', id: only.id, at: [x, y, v] })} />
        {size && (
          <>
            <NumberField label="Width" value={size.width} onCommit={(width) => dispatch({ type: 'setSize', id: only.id, size: { width } })} />
            <NumberField label="Depth" value={size.depth} onCommit={(depth) => dispatch({ type: 'setSize', id: only.id, size: { depth } })} />
            <NumberField label="Height" value={size.height} onCommit={(height) => dispatch({ type: 'setSize', id: only.id, size: { height } })} />
          </>
        )}
        <NumberField label="Rotate X" value={euler[0]} onCommit={turn(0)} />
        <NumberField label="Rotate Y" value={euler[1]} onCommit={turn(1)} />
        <NumberField label="Rotate Z" value={euler[2]} onCommit={turn(2)} />
        {typeToggle}
        {color}
      </div>
      {tilted && (
        <p className="muted hint">
          This shape is tilted, so its resize and lift handles are hidden. Set Rotate X and Y back to 0 to use them.
        </p>
      )}
      {actions}
    </section>
  );
}

/**
 * A text box that edits a local draft and applies it on Enter or blur. Whatever the document
 * decides (accepted, rejected, normalised), the box then shows the document's value.
 */
function useDraft(value: string, onCommit: (draft: string) => void) {
  const [draft, setDraft] = useState(value);
  // After a commit the box must show whatever the document decided, whether it accepted the
  // edit (value changed), rejected it (value unchanged) or normalised it. Bumping `settled`
  // makes the effect below re-read the value *after* the dispatch has rendered. Resetting the
  // draft straight away would flash the old value, and a blur landing in that gap would
  // commit it and silently undo the edit.
  const [settled, setSettled] = useState(0);
  useEffect(() => setDraft(value), [value, settled]);
  const commit = (typed: string) => {
    if (typed !== value) onCommit(typed);
    setSettled((n) => n + 1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit(e.currentTarget.value);
    else if (e.key === 'Escape') setDraft(value);
  };
  return { value: draft, onChange: setDraft, onBlur: (e: FocusEvent<HTMLInputElement>) => commit(e.currentTarget.value), onKeyDown };
}

function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const d = useDraft(value, onCommit);
  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={d.value} onChange={(e) => d.onChange(e.target.value)} onBlur={d.onBlur} onKeyDown={d.onKeyDown} />
    </label>
  );
}

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const d = useDraft(fmt(value), (draft) => {
    const n = draft.trim() === '' ? Number.NaN : Number(draft);
    if (Number.isFinite(n)) onCommit(n);
  });
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step="any" value={d.value} onChange={(e) => d.onChange(e.target.value)} onBlur={d.onBlur} onKeyDown={d.onKeyDown} />
    </label>
  );
}
