import { createEmptyDesign, newId } from '@holecraft/core';
import { useEffect, useState } from 'react';
import { fetchHealth, type Health } from './api.ts';
import { ViewportCanvas } from './viewport/ViewportCanvas.tsx';

type ServerState = { kind: 'checking' } | { kind: 'online'; health: Health } | { kind: 'offline' };

export function App() {
  const [design] = useState(() => createEmptyDesign(newId()));
  const [server, setServer] = useState<ServerState>({ kind: 'checking' });

  useEffect(() => {
    const ctrl = new AbortController();
    fetchHealth(ctrl.signal).then(
      (health) => setServer({ kind: 'online', health }),
      () => !ctrl.signal.aborted && setServer({ kind: 'offline' }),
    );
    return () => ctrl.abort();
  }, []);

  const [width, depth] = design.grid.size;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={22} height={22} />
          <span>Holecraft</span>
        </div>
        <div className="design-name">{design.name}</div>
        <ServerStatus state={server} />
      </header>

      <main className="workspace">
        <ViewportCanvas width={width} depth={depth} />
        <aside className="panel">
          <h2>Shapes</h2>
          <p className="muted">The shape library arrives in Phase 1.</p>
        </aside>
      </main>

      <footer className="statusbar">
        <span>
          Workplane {width} × {depth} {design.units}
        </span>
        <span>Snap {design.grid.snap} {design.units}</span>
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
