import { SHAPE_DEFS, translationOf, type Design, type NodeId, type ShapeType } from '@holecraft/core';
import type { DragEvent, KeyboardEvent } from 'react';
import { SHAPE_DRAG_TYPE } from './shapeDrag.ts';

const fmt = (n: number) => String(Number(n.toFixed(2)));

export function ShapesPanel({ onAddShape }: { onAddShape: (type: ShapeType) => void }) {
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
    <section aria-label="Shapes">
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
    </section>
  );
}

interface ObjectListProps {
  design: Design;
  selection: readonly NodeId[];
  onSelect: (id: NodeId, additive: boolean) => void;
}

export function ObjectList({ design, selection, onSelect }: ObjectListProps) {
  return (
    <section aria-label="Objects">
      <h2>Objects</h2>
      <ul className="object-list" data-testid="object-list">
        {design.roots.map((id) => {
          const node = design.nodes[id];
          if (!node) return null;
          const [x, y] = translationOf(node.transform);
          const selected = selection.includes(id);
          return (
            <li key={id} data-selected={selected} data-color={node.color}>
              <button type="button" className={selected ? 'selected' : undefined} onClick={(e) => onSelect(id, e.shiftKey)}>
                <span className="dot" style={{ background: node.color }} aria-hidden="true" />
                {node.name} ({fmt(x)}, {fmt(y)})
              </button>
            </li>
          );
        })}
      </ul>
      {design.roots.length === 0 && <p className="muted">Nothing here yet.</p>}
    </section>
  );
}
