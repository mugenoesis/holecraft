import { addShape, createEmptyDesign, newId, type ShapeType } from '@holecraft/core';
import { useCallback, useEffect, useState } from 'react';
import { fetchHealth, type Health } from './api.ts';
import { ShapesPanel } from './ShapesPanel.tsx';
import { ViewportCanvas } from './viewport/ViewportCanvas.tsx';

type ServerState = { kind: 'checking' } | { kind: 'online'; health: Health } | { kind: 'offline' };

export function App() {
  const [design, setDesign] = useState(() => createEmptyDesign(newId()));
  const [server, setServer] = useState<ServerState>({ kind: 'checking' });

  useEffect(() => {
    const ctrl = new AbortController();
    fetchHealth(ctrl.signal).then(
      (health) => setServer({ kind: 'online', health }),
      () => !ctrl.signal.aborted && setServer({ kind: 'offline' }),
    );
    return () => ctrl.abort();
  }, []);

  const add = useCallback((type: ShapeType, at: [number, number] = [0, 0]) => {
    setDesign((d) => addShape(d, type, at).design);
  }, []);

  const [width, depth] = design.grid.size;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/icon-192.png" alt="" width={24} height={24} />
          <span>Holecraft</span>
        </div>
        <div className="design-name">{design.name}</div>
        <ServerStatus state={server} />
      </header>

      <main className="workspace">
        <ViewportCanvas design={design} onDropShape={add} />
        <ShapesPanel design={design} onAddShape={add} />
      </main>

      <footer className="statusbar">
        <span>
          Workplane {width} × {depth} {design.units}
        </span>
        <span>
          Snap {design.grid.snap} {design.units}
        </span>
        <span>Objects: {design.roots.length}</span>
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
