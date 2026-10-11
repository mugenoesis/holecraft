import {
  HOME_VIEW,
  clampToWorkplane,
  eulerOfTransform,
  isShapeType,
  isUpright,
  nudgeDirections,
  rotationOfTransform,
  shapeCenter,
  snapToGrid,
  translationOf,
  type Design,
  type NodeId,
  type OrbitState,
  type ShapeGeometry,
  type ShapeType,
  type Vec3,
  type ViewPresetName,
} from '@holecraft/core';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { isTypingTarget } from '../keyboard.ts';
import { SHAPE_DRAG_TYPE } from '../shapeDrag.ts';
import type { Projection } from './CameraRig.ts';
import { HandlesOverlay } from './HandlesOverlay.tsx';
import { RotationRings } from './RotationRings.tsx';
import { ViewCube } from './ViewCube.tsx';
import { Viewport, type PixelRect } from './Viewport.ts';

interface Props {
  design: Design;
  selection: readonly NodeId[];
  onDropShape: (type: ShapeType, at: [number, number]) => void;
  onPick: (id: NodeId | null, additive: boolean, phase: 'down' | 'click') => void;
  onMoveStart: () => void;
  onMove: (delta: [number, number]) => void;
  onMoveEnd: () => void;
  onMarquee: (ids: NodeId[], additive: boolean) => void;
  onNudge: (delta: [number, number]) => void;
  /** A resize or lift handle is dragging the selected shape into this geometry. */
  onGeometry: (id: NodeId, geometry: ShapeGeometry) => void;
  /** A rotation ring is turning the selected shape into this orientation (row-major 3x3). */
  onRotation: (id: NodeId, rotation: number[]) => void;
}

interface SelectedShape {
  id: NodeId;
  geometry: ShapeGeometry;
  /** Orientation as a row-major 3x3. */
  rotation: number[];
  /** Turn about the vertical axis in degrees; only meaningful when `upright`. */
  yaw: number;
  /** False once tipped over, when resizing and lifting are not offered. */
  upright: boolean;
  /** Middle of the shape in world space, and the radius of its rotation rings. */
  center: Vec3;
  ringRadius: number;
}

/** The single selected shape with everything the handles need, or null when none should show. */
function selectedShape(design: Design, selection: readonly NodeId[]): SelectedShape | null {
  const id = selection.length === 1 ? selection[0]! : undefined;
  const node = id !== undefined ? design.nodes[id] : undefined;
  if (!id || !node || node.kind !== 'shape' || node.locked || node.hidden) return null;
  const [x, y, z] = translationOf(node.transform);
  const { width, depth, height } = node.params as { width: number; depth: number; height: number };
  const rotation = rotationOfTransform(node.transform);
  return {
    id,
    geometry: { x, y, z, width, depth, height },
    rotation,
    yaw: eulerOfTransform(node.transform)[2],
    upright: isUpright(rotation),
    center: shapeCenter(node.transform, height),
    ringRadius: Math.hypot(width, depth, height) / 2 + 6,
  };
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

/** React host for the imperative three.js viewport, plus its overlay controls. */
export function ViewportCanvas(props: Props) {
  const { design, selection, onDropShape } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  // The Viewport outlives renders, so it reads the latest props through this ref.
  const latest = useRef(props);
  latest.current = props;

  const [failed, setFailed] = useState(false);
  const [marquee, setMarquee] = useState<PixelRect | null>(null);
  const [dimensionLabel, setDimensionLabel] = useState<string | null>(null);
  const [camera, setCamera] = useState<{ state: OrbitState; projection: Projection }>({ state: HOME_VIEW, projection: 'perspective' });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

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
        onPick: (...a) => latest.current.onPick(...a),
        onMoveStart: () => latest.current.onMoveStart(),
        onMove: (d) => latest.current.onMove(d),
        onMoveEnd: () => latest.current.onMoveEnd(),
        onMarquee: (...a) => latest.current.onMarquee(...a),
        onMarqueeRect: setMarquee,
      });
    } catch (err) {
      console.warn('Viewport failed to start:', err);
      setFailed(true);
      return;
    }
    setFailed(false);
    viewport.setDesign(latest.current.design);
    viewport.setSelection(latest.current.selection);
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
    viewportRef.current?.setSelection(selection);
  }, [selection]);

  useEffect(() => {
    const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const arrow = ARROWS[e.key];
      if (arrow) {
        // Arrow keys move along the world axis closest to the on-screen direction.
        const step = (latest.current.design.grid.snap || 1) * (e.shiftKey ? 10 : 1);
        const dirs = nudgeDirections(cameraRef.current.state.azimuth);
        const along = arrow[1] !== 0 ? dirs.up : dirs.right;
        const sign = arrow[0] + arrow[1];
        latest.current.onNudge([along[0] * sign * step, along[1] * sign * step]);
      } else if (e.key === 'Home') viewportRef.current?.home();
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
  const selected = selectedShape(design, selection);

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

      {marquee && (
        <div
          className="marquee"
          data-testid="marquee"
          style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
        />
      )}

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
          {selected?.upright && (
            <HandlesOverlay
              key={selected.id}
              nodeId={selected.id}
              geometry={selected.geometry}
              yaw={selected.yaw}
              snap={design.grid.snap}
              getViewport={() => viewportRef.current}
              onStart={() => latest.current.onMoveStart()}
              onGeometry={(id, g) => latest.current.onGeometry(id, g)}
              onEnd={() => latest.current.onMoveEnd()}
              onLabel={setDimensionLabel}
            />
          )}
          {selected && (
            <RotationRings
              key={`rings-${selected.id}`}
              nodeId={selected.id}
              center={selected.center}
              radius={selected.ringRadius}
              rotation={selected.rotation}
              getViewport={() => viewportRef.current}
              onStart={() => latest.current.onMoveStart()}
              onRotation={(id, r) => latest.current.onRotation(id, r)}
              onEnd={() => latest.current.onMoveEnd()}
              onLabel={setDimensionLabel}
            />
          )}
          {dimensionLabel && (
            <div className="dimension-label" data-testid="dimension-label" aria-live="polite">
              {dimensionLabel}
            </div>
          )}
        </>
      )}
    </div>
  );
}
