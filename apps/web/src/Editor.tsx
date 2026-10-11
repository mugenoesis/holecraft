import { canGroup, canRedo, canUndo, canUngroup, type Design, type NodeId, type ShapeType } from '@holecraft/core';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError, getDesign, saveDesign } from './designsApi.ts';
import { createEditorState, editorReducer } from './editorState.ts';
import { ExportMenu } from './ExportMenu.tsx';
import { trackLeaving } from './leaving.ts';
import { isTypingTarget } from './keyboard.ts';
import { Link } from './Link.tsx';
import { NotFound } from './NotFound.tsx';
import { PropertiesPanel } from './PropertiesPanel.tsx';
import { SaveController, type SaveStatus } from './saveController.ts';
import { ServerStatus } from './ServerStatus.tsx';
import { ObjectList, ShapesPanel } from './ShapesPanel.tsx';
import { useDraft } from './useDraft.ts';
import { ViewportCanvas } from './viewport/ViewportCanvas.tsx';

type Load = { kind: 'loading' } | { kind: 'ready'; design: Design } | { kind: 'missing' } | { kind: 'failed'; message: string };

/** Opens one saved design: loads it, then hands over to the editor. */
export function Editor({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: 'loading' });
    getDesign(id).then(
      (design) => !cancelled && setLoad({ kind: 'ready', design }),
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) setLoad({ kind: 'missing' });
        else setLoad({ kind: 'failed', message: error instanceof Error ? error.message : 'Something went wrong' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  if (load.kind === 'loading') return <main className="screen-message muted">Loading…</main>;
  if (load.kind === 'missing') return <NotFound heading="Design not found">It may have been deleted.</NotFound>;
  if (load.kind === 'failed') {
    return (
      <NotFound heading="This design could not be opened">
        {load.message}{' '}
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </NotFound>
    );
  }
  return <EditorView initial={load.design} />;
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Couldn’t save',
};

function EditorView({ initial }: { initial: Design }) {
  const [state, dispatch] = useReducer(editorReducer, initial, createEditorState);
  const design = state.history.present;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const controller = useRef<SaveController | null>(null);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);

  // Autosave: the controller saves the latest design shortly after changes stop, retrying on failure.
  useEffect(() => {
    const c = new SaveController(
      (d) => saveDesign(d).then(() => undefined),
      (status) => {
        setSaveStatus(status);
        if (status === 'error') {
          const e = c.lastError;
          setSaveProblem(e instanceof ApiError && e.status === 404 ? 'this design no longer exists' : e instanceof ApiError && !e.retryable ? e.message : 'retrying…');
        } else setSaveProblem(null);
      },
      { shouldRetry: (e) => !(e instanceof ApiError) || e.retryable },
    );
    controller.current = c;

    // If the tab is closed or hidden with changes still waiting, send them now.
    const onPageHide = () => {
      const pending = c.pendingDesign();
      if (pending) void saveDesign(pending, { keepalive: true }).catch(() => undefined);
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      controller.current = null;
      // Leaving for the list: save whatever is still waiting, then stop.
      trackLeaving(c.flush().finally(() => c.dispose()));
    };
  }, []);

  useEffect(() => {
    if (design !== initial) controller.current?.schedule(design);
  }, [design, initial]);

  useEffect(() => {
    document.title = `${design.name} – Holecraft`;
    return () => {
      document.title = 'Holecraft';
    };
  }, [design.name]);

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
        <Link to="/" className="back-link" title="Back to all your designs">
          ← All designs
        </Link>
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
        <DesignNameField name={design.name} onCommit={(name) => dispatch({ type: 'renameDesign', name })} />
        <ExportMenu design={design} selection={state.selection} />
        <span className={`save-status ${saveStatus}`} data-testid="save-status" aria-live="polite" title={controller.current?.lastError?.message}>
          {STATUS_LABEL[saveStatus]}
          {saveStatus === 'error' && saveProblem ? `: ${saveProblem}` : ''}
        </span>
        <ServerStatus />
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

/** The design's name, editable in place in the top bar. */
function DesignNameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const d = useDraft(name, onCommit);
  return (
    <input
      className="design-name-input"
      aria-label="Design name"
      type="text"
      maxLength={120}
      value={d.value}
      onChange={(e) => d.onChange(e.target.value)}
      onBlur={d.onBlur}
      onKeyDown={d.onKeyDown}
    />
  );
}
