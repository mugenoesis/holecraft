import { canGroup, canRedo, canUndo, canUngroup, createEmptyDesign, newId, type NodeId, type ShapeType } from '@holecraft/core';
import { useCallback, useEffect, useReducer, useState } from 'react';
import { fetchHealth, type Health } from './api.ts';
import { createEditorState, editorReducer } from './editorState.ts';
import { isTypingTarget } from './keyboard.ts';
import { PropertiesPanel } from './PropertiesPanel.tsx';
import { ObjectList, ShapesPanel } from './ShapesPanel.tsx';
import { ViewportCanvas } from './viewport/ViewportCanvas.tsx';

type ServerState = { kind: 'checking' } | { kind: 'online'; health: Health } | { kind: 'offline' };

export function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(createEmptyDesign(newId())));
  const [server, setServer] = useState<ServerState>({ kind: 'checking' });
  const design = state.history.present;

  useEffect(() => {
    const ctrl = new AbortController();
    fetchHealth(ctrl.signal).then(
      (health) => setServer({ kind: 'online', health }),
      () => !ctrl.signal.aborted && setServer({ kind: 'offline' }),
    );
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      else if (mod && key === 'y') dispatch({ type: 'redo' });
      else if (mod && key === 'd') dispatch({ type: 'duplicate' });
      else if (mod && key === 'g') dispatch({ type: e.shiftKey ? 'ungroup' : 'group' });
      else if (mod && key === 'a') dispatch({ type: 'selectAll' });
      else if (!mod && key === 'd') dispatch({ type: 'dropToPlane' });
      else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) dispatch({ type: 'delete' });
      else if (!mod && e.key === 'Escape') dispatch({ type: 'clearSelection' });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const addAt = useCallback((shape: ShapeType, at: [number, number]) => dispatch({ type: 'add', shape, at }), []);
  // A list row is a complete click: the press selects (shift toggles), and the release narrows a
  // multi-selection down to the clicked row, which the viewport only does when nothing was dragged.
  const select = useCallback((id: NodeId, additive: boolean) => {
    dispatch({ type: 'pick', id, additive, phase: 'down' });
    dispatch({ type: 'pick', id, additive, phase: 'click' });
  }, []);

  const [width, depth] = design.grid.size;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/icon-192.png" alt="" width={24} height={24} />
          <span>Holecraft</span>
        </div>
        <div className="edit-actions" role="toolbar" aria-label="Edit">
          <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo(state.history)} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button type="button" onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo(state.history)} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
        </div>
        <div className="edit-actions" role="toolbar" aria-label="Group">
          <button type="button" onClick={() => dispatch({ type: 'group' })} disabled={!canGroup(design, state.selection)} title="Group the selected shapes (Ctrl+G)">
            Group
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'ungroup' })}
            disabled={!canUngroup(design, state.selection)}
            title="Split the selected group back into shapes (Ctrl+Shift+G)"
          >
            Ungroup
          </button>
        </div>
        <div className="design-name">{design.name}</div>
        <ServerStatus state={server} />
      </header>

      <main className="workspace">
        <ViewportCanvas
          design={design}
          selection={state.selection}
          onDropShape={addAt}
          onPick={(id, additive, phase) => dispatch({ type: 'pick', id, additive, phase })}
          onMoveStart={() => dispatch({ type: 'moveStart' })}
          onMove={(delta) => dispatch({ type: 'move', delta })}
          onMoveEnd={() => dispatch({ type: 'moveEnd' })}
          onMarquee={(ids, additive) => dispatch({ type: 'marquee', ids, additive })}
          onNudge={(delta) => dispatch({ type: 'nudge', delta })}
          onGeometry={(id, geometry) => dispatch({ type: 'setGeometry', id, geometry })}
          onRotation={(id, rotation) => dispatch({ type: 'setRotation', id, rotation })}
        />
        <aside className="panel">
          <ShapesPanel onAddShape={(shape) => addAt(shape, [0, 0])} />
          <PropertiesPanel design={design} selection={state.selection} dispatch={dispatch} />
          <ObjectList design={design} selection={state.selection} onSelect={select} />
        </aside>
      </main>

      <footer className="statusbar">
        <span>
          Workplane {width} × {depth} {design.units}
        </span>
        <span>
          Snap {design.grid.snap} {design.units}
        </span>
        <span>Objects: {design.roots.length}</span>
        {state.selection.length > 0 && <span>Selected: {state.selection.length}</span>}
      </footer>
    </div>
  );
}

function ServerStatus({ state }: { state: ServerState }) {
  const label =
    state.kind === 'online' ? `Server v${state.health.version}` : state.kind === 'offline' ? 'Server offline' : 'Connecting…';
  return (
    <div className={`server-status ${state.kind}`} role="status">
      <span className="dot" aria-hidden="true" />
      {label}
    </div>
  );
}
