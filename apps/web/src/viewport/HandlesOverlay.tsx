import { HANDLE_IDS, dragHandleYawed, handlePositionYawed, type HandleId, type NodeId, type ShapeGeometry, type Vec3 } from '@holecraft/core';
import { useRef, type PointerEvent } from 'react';
import { describeDrag, handleAriaLabel } from './handleLabel.ts';
import type { Viewport } from './Viewport.ts';

/** How far above the top face the lift handle floats on screen, so it clears the height handle. */
const LIFT_OFFSET_PX = 28;

interface Props {
  nodeId: NodeId;
  geometry: ShapeGeometry;
  /** Degrees the shape is turned about the vertical axis through its centre. */
  yaw: number;
  snap: number;
  /** Looked up lazily: the Viewport is created after the first render. */
  getViewport: () => Viewport | null;
  onStart: () => void;
  onGeometry: (id: NodeId, geometry: ShapeGeometry) => void;
  onEnd: () => void;
  onLabel: (text: string | null) => void;
}

interface Grab {
  id: HandleId;
  start: ShapeGeometry;
  /** Difference between the handle's position and where the pointer first touched it. */
  offset: Vec3;
}

const isVertical = (id: HandleId) => id === 'height' || id === 'lift';

/**
 * Resize and lift handles for the selected shape, drawn as buttons over the 3D view so they
 * keep a constant size and are reachable by assistive technology. All the maths is in core.
 */
export function HandlesOverlay({ nodeId, geometry, yaw, snap, getViewport, onStart, onGeometry, onEnd, onLabel }: Props) {
  const grab = useRef<Grab | null>(null);
  const viewport = getViewport();
  if (!viewport) return null;

  /** The world position the pointer is dragging the handle towards, or null if it points nowhere useful. */
  const pointerTarget = (g: Grab, e: PointerEvent): Vec3 | null => {
    const vp = getViewport();
    if (!vp) return null;
    if (isVertical(g.id)) {
      const z = vp.pickHeight(e.clientX, e.clientY, [g.start.x, g.start.y]);
      return z === null ? null : [g.start.x, g.start.y, z + g.offset[2]];
    }
    const hit = vp.pickWorkplane(e.clientX, e.clientY, g.start.z);
    return hit ? [hit[0] + g.offset[0], hit[1] + g.offset[1], g.start.z] : null;
  };

  const onPointerDown = (id: HandleId, e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { ...geometry };
    const at = handlePositionYawed(start, yaw, id);
    const g: Grab = { id, start, offset: [0, 0, 0] };
    const v = getViewport();
    const touched = isVertical(id) ? v?.pickHeight(e.clientX, e.clientY, [start.x, start.y]) : v?.pickWorkplane(e.clientX, e.clientY, start.z);
    if (typeof touched === 'number') g.offset = [0, 0, at[2] - touched];
    else if (touched) g.offset = [at[0] - touched[0], at[1] - touched[1], 0];

    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = g;
    onStart();
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const g = grab.current;
    if (!g) return;
    const target = pointerTarget(g, e);
    if (!target) return;
    const next = dragHandleYawed(g.start, yaw, g.id, target, { snap, uniform: e.shiftKey, fromCenter: e.altKey });
    onGeometry(nodeId, next);
    onLabel(describeDrag(g.id, next));
  };

  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (!grab.current) return;
    grab.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onEnd();
    onLabel(null);
  };

  return (
    <div className="handles" role="group" aria-label="Shape handles">
      {HANDLE_IDS.map((id) => {
        const p = viewport.project(handlePositionYawed(geometry, yaw, id));
        if (!p) return null;
        const y = id === 'lift' ? p.y - LIFT_OFFSET_PX : p.y;
        return (
          <button
            key={id}
            type="button"
            className={`handle ${id.startsWith('corner') ? 'corner' : id.startsWith('side') ? 'side' : id}`}
            data-testid={`handle-${id}`}
            aria-label={handleAriaLabel(id)}
            style={{ left: p.x, top: y }}
            onPointerDown={(e) => onPointerDown(id, e)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        );
      })}
    </div>
  );
}
