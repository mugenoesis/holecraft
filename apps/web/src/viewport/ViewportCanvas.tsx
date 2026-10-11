import {
  HOME_VIEW,
  clampToWorkplane,
  isShapeType,
  snapToGrid,
  type Design,
  type OrbitState,
  type ShapeType,
  type ViewPresetName,
} from '@holecraft/core';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { SHAPE_DRAG_TYPE } from '../shapeDrag.ts';
import type { Projection } from './CameraRig.ts';
import { ViewCube } from './ViewCube.tsx';
import { Viewport } from './Viewport.ts';

interface Props {
  design: Design;
  onDropShape: (type: ShapeType, at: [number, number]) => void;
}

const VIEW_OPTIONS: ReadonlyArray<{ value: ViewPresetName; label: string }> = [
  { value: 'iso', label: 'Isometric' },
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Back' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** React host for the imperative three.js viewport, plus its overlay controls. */
export function ViewportCanvas({ design, onDropShape }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const designRef = useRef(design);
  designRef.current = design;

  const [failed, setFailed] = useState(false);
  const [camera, setCamera] = useState<{ state: OrbitState; projection: Projection }>({ state: HOME_VIEW, projection: 'perspective' });

  const [width, depth] = design.grid.size;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // WebGL can be missing (VMs, blocked GPU drivers); keep the rest of the UI alive.
    let viewport: Viewport;
    try {
      viewport = new Viewport(host, {
        workplaneWidth: width,
        workplaneDepth: depth,
        onCameraChange: (state, projection) => setCamera({ state, projection }),
      });
    } catch (err) {
      console.warn('Viewport failed to start:', err);
      setFailed(true);
      return;
    }
    setFailed(false);
    viewport.setDesign(designRef.current);
    viewportRef.current = viewport;
    return () => {
      viewportRef.current = null;
      viewport.dispose();
    };
  }, [width, depth]);

  useEffect(() => {
    viewportRef.current?.setDesign(design);
  }, [design]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === 'Home') viewportRef.current?.home();
      else if (e.key === 'f' || e.key === 'F') viewportRef.current?.fitAll();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(SHAPE_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e: DragEvent) => {
    const type = e.dataTransfer.getData(SHAPE_DRAG_TYPE);
    if (!isShapeType(type)) return;
    e.preventDefault();
    const hit = viewportRef.current?.pickWorkplane(e.clientX, e.clientY);
    if (!hit) return; // pointer is over the sky or an edge-on workplane
    const [x, y] = clampToWorkplane(hit, design.grid.size);
    onDropShape(type, [snapToGrid(x, design.grid.snap), snapToGrid(y, design.grid.snap)]);
  };

  const { state, projection } = camera;

  return (
    <div
      className="viewport"
      data-testid="viewport"
      data-azimuth={state.azimuth}
      data-polar={state.polar}
      data-distance={state.distance}
      data-target={JSON.stringify(state.target)}
      data-projection={projection}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="viewport-canvas" ref={hostRef} />

      {failed ? (
        <div className="viewport-error" role="alert">
          <strong>The 3D view could not start.</strong>
          <p>Holecraft needs WebGL 2. Enable hardware acceleration in your browser, or update your graphics drivers.</p>
        </div>
      ) : (
        <>
          <div className="viewport-toolbar" role="toolbar" aria-label="View controls">
            <button type="button" onClick={() => viewportRef.current?.home()} aria-label="Home view" title="Home view (Home)">
              Home
            </button>
            <button type="button" onClick={() => viewportRef.current?.fitAll()} aria-label="Fit all" title="Fit all (F)">
              Fit
            </button>
            <button
              type="button"
              aria-pressed={projection === 'orthographic'}
              aria-label="Orthographic"
              title="Toggle orthographic projection"
              onClick={() => viewportRef.current?.setProjection(projection === 'orthographic' ? 'perspective' : 'orthographic')}
            >
              Ortho
            </button>
            <select
              aria-label="Standard views"
              value=""
              onChange={(e) => {
                if (e.target.value) viewportRef.current?.setView(e.target.value as ViewPresetName);
              }}
            >
              <option value="">View…</option>
              {VIEW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <ViewCube camera={state} onSelect={(view) => viewportRef.current?.setView(view)} />
        </>
      )}
    </div>
  );
}
