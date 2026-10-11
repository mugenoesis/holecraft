import { SHAPE_DEFS, translationOf, type Design, type ShapeType } from '@holecraft/core';
import type { DragEvent, KeyboardEvent } from 'react';
import { SHAPE_DRAG_TYPE } from './shapeDrag.ts';

interface Props {
  design: Design;
  onAddShape: (type: ShapeType) => void;
}

const fmt = (n: number) => String(Number(n.toFixed(2)));

export function ShapesPanel({ design, onAddShape }: Props) {
  const onDragStart = (e: DragEvent, type: ShapeType) => {
    e.dataTransfer.setData(SHAPE_DRAG_TYPE, type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onKeyDown = (e: KeyboardEvent, type: ShapeType) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAddShape(type);
    }
  };

  return (
    <aside className="panel">
      <h2>Shapes</h2>
      <p className="muted hint">Drag onto the workplane, or click to add at the centre.</p>
      <div className="shape-grid">
        {SHAPE_DEFS.map((def) => (
          <div
            key={def.id}
            role="button"
            tabIndex={0}
            draggable
            className="shape-tile"
            onClick={() => onAddShape(def.id)}
            onKeyDown={(e) => onKeyDown(e, def.id)}
            onDragStart={(e) => onDragStart(e, def.id)}
          >
            <span className={`swatch ${def.id}`} style={{ background: def.color }} aria-hidden="true" />
            {def.name}
          </div>
        ))}
      </div>

      <h2>Objects</h2>
      <ul className="object-list" data-testid="object-list">
        {design.roots.map((id) => {
          const node = design.nodes[id];
          if (!node) return null;
          const [x, y] = translationOf(node.transform);
          return (
            <li key={id}>
              {node.name} ({fmt(x)}, {fmt(y)})
            </li>
          );
        })}
      </ul>
      {design.roots.length === 0 && <p className="muted">Nothing here yet.</p>}
    </aside>
  );
}
