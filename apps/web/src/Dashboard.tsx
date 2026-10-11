import type { DesignSummary } from '@holecraft/core';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { afterLeaving } from './leaving.ts';
import { ApiError, createDesign, deleteDesign, duplicateDesign, listDesigns, renameDesignOnServer, thumbnailUrl } from './designsApi.ts';
import { Link } from './Link.tsx';
import { designPath, navigate } from './router.ts';
import { ServerStatus } from './ServerStatus.tsx';
import { formatWhen } from './time.ts';

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; designs: DesignSummary[] };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong');

/** The home screen: every saved design, and a way to make a new one. */
export function Dashboard() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      await afterLeaving(); // a save started by leaving the editor must land before we list
      setLoad({ kind: 'ready', designs: await listDesigns() });
    } catch (error) {
      setLoad({ kind: 'error', message: messageOf(error) });
    }
  }, []);

  useEffect(() => {
    document.title = 'Holecraft';
    void refresh();
  }, [refresh]);

  const startNew = async () => {
    setCreating(true);
    setProblem(null);
    try {
      navigate(designPath((await createDesign()).id));
    } catch (error) {
      setProblem(messageOf(error));
      setCreating(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/icon-192.png" alt="" width={24} height={24} />
          <span>Holecraft</span>
        </div>
        <div className="spacer" />
        <ServerStatus />
      </header>

      <main className="dashboard">
        <div className="dashboard-head">
          <h1>Your designs</h1>
          <button type="button" className="primary" onClick={startNew} disabled={creating}>
            New design
          </button>
        </div>

        {problem && (
          <p className="notice error" role="alert">
            {problem}
          </p>
        )}

        {load.kind === 'loading' && <p className="muted">Loading…</p>}

        {load.kind === 'error' && (
          <div className="notice error" role="alert">
            <span>{load.message}</span>
            <button type="button" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}

        {load.kind === 'ready' && load.designs.length === 0 && (
          <div className="empty">
            <p>No designs yet</p>
            <p className="muted">Choose New design to start building something.</p>
          </div>
        )}

        {load.kind === 'ready' && load.designs.length > 0 && (
          <ul className="design-grid" data-testid="design-list" aria-label="Designs">
            {load.designs.map((design) => (
              <DesignCard key={design.id} design={design} onChanged={refresh} onProblem={setProblem} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

interface CardProps {
  design: DesignSummary;
  onChanged: () => Promise<void>;
  onProblem: (message: string | null) => void;
}

function DesignCard({ design, onChanged, onProblem }: CardProps) {
  const [mode, setMode] = useState<'view' | 'renaming' | 'confirming'>('view');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    onProblem(null);
    try {
      await action();
      await onChanged();
    } catch (error) {
      onProblem(error instanceof ApiError && error.status === 404 ? 'That design no longer exists' : messageOf(error));
      await onChanged();
    } finally {
      setBusy(false);
      setMode('view');
    }
  };

  const picture = thumbnailUrl(design);
  const objects = `${design.objectCount} ${design.objectCount === 1 ? 'object' : 'objects'}`;

  return (
    <li className="design-card" data-testid="design-card" data-design-id={design.id}>
      {/* The picture is a second way into the design; the name below is the link for keyboards and screen readers. */}
      <Link to={designPath(design.id)} className="design-thumb" tabIndex={-1} aria-hidden="true">
        {picture ? <img src={picture} alt="" loading="lazy" width={320} height={240} /> : <span className="design-thumb-empty">No picture yet</span>}
      </Link>
      {mode === 'renaming' ? (
        <RenameBox
          name={design.name}
          onCancel={() => setMode('view')}
          onCommit={(name) => (name === design.name ? setMode('view') : run(() => renameDesignOnServer(design.id, name)))}
        />
      ) : (
        <Link to={designPath(design.id)} className="design-name-link">
          {design.name}
        </Link>
      )}
      <p className="muted design-meta">
        {objects} · updated {formatWhen(design.updatedAt)}
      </p>

      {mode === 'confirming' ? (
        <div className="confirm" role="group" aria-label="Confirm delete">
          <span>Delete this design?</span>
          <button type="button" className="danger" disabled={busy} onClick={() => void run(() => deleteDesign(design.id))}>
            Yes, delete
          </button>
          <button type="button" onClick={() => setMode('view')}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="button-row">
          <button type="button" aria-label={`Rename ${design.name}`} disabled={busy} onClick={() => setMode('renaming')}>
            Rename
          </button>
          <button type="button" aria-label={`Duplicate ${design.name}`} disabled={busy} onClick={() => void run(() => duplicateDesign(design.id))}>
            Duplicate
          </button>
          <button type="button" aria-label={`Delete ${design.name}`} disabled={busy} onClick={() => setMode('confirming')}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

/** An inline text box for renaming: Enter or clicking away applies, Escape cancels. */
function RenameBox({ name, onCommit, onCancel }: { name: string; onCommit: (name: string) => void; onCancel: () => void }) {
  const finished = useRef(false);
  const finish = (action: () => void) => {
    if (finished.current) return; // Enter is followed by a blur as the box goes away; only act once
    finished.current = true;
    action();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') finish(() => (e.currentTarget.value.trim() ? onCommit(e.currentTarget.value.trim()) : onCancel()));
    else if (e.key === 'Escape') finish(onCancel);
  };
  return (
    <input
      className="rename-box"
      aria-label="Design name"
      defaultValue={name}
      maxLength={120}
      autoFocus // the box only appears because the user asked to rename
      onKeyDown={onKeyDown}
      onBlur={(e) => finish(() => (e.currentTarget.value.trim() ? onCommit(e.currentTarget.value.trim()) : onCancel()))}
    />
  );
}
