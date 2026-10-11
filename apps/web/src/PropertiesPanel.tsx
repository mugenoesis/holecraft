import { translationOf, type Design, type NodeId } from '@holecraft/core';
import { useEffect, useState, type Dispatch, type KeyboardEvent } from 'react';
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

  const only = nodes.length === 1 ? nodes[0]! : null;

  if (!only) {
    return (
      <section aria-label="Properties">
        <h2>Properties</h2>
        <p>{nodes.length} shapes selected</p>
        {color}
        {actions}
      </section>
    );
  }

  const [x, y] = translationOf(only.transform);
  const size = only.kind === 'shape' ? (only.params as { width: number; depth: number; height: number }) : null;

  return (
    <section aria-label="Properties">
      <h2>Properties</h2>
      {/* Keyed by id so half-typed values never leak from one shape to another. */}
      <div key={only.id} className="fields">
        <TextField label="Name" value={only.name} onCommit={(name) => dispatch({ type: 'rename', id: only.id, name })} />
        <NumberField label="X" value={x} onCommit={(v) => dispatch({ type: 'setPosition', id: only.id, at: [v, y] })} />
        <NumberField label="Y" value={y} onCommit={(v) => dispatch({ type: 'setPosition', id: only.id, at: [x, v] })} />
        {size && (
          <>
            <NumberField label="Width" value={size.width} onCommit={(width) => dispatch({ type: 'setSize', id: only.id, size: { width } })} />
            <NumberField label="Depth" value={size.depth} onCommit={(depth) => dispatch({ type: 'setSize', id: only.id, size: { depth } })} />
            <NumberField label="Height" value={size.height} onCommit={(height) => dispatch({ type: 'setSize', id: only.id, size: { height } })} />
          </>
        )}
        {color}
      </div>
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
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
    setDraft(value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') setDraft(value);
  };
  return { value: draft, onChange: setDraft, onBlur: commit, onKeyDown };
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
