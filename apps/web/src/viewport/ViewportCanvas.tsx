import {
	type Design,
	type EdgeTreatment,
	HOME_VIEW,
	type MeshData,
	type NodeId,
	type OrbitState,
	type ShapeGeometry,
	type ShapeType,
	type Vec3,
	type WorkPlane,
} from '@holecraft/core';
import { meshRefsIn, type Subtree } from '@holecraft/geometry';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GeometryService } from '../geometry/GeometryService.ts';
import { createWorkerEvaluator, type WorkerEvaluator } from '../geometry/workerEvaluator.ts';
import { ThumbnailScheduler } from '../thumbnailScheduler.ts';
import type { Projection } from './CameraRig.ts';
import { EdgeTool } from './EdgeTool.tsx';
import { HandlesOverlay } from './HandlesOverlay.tsx';
import { RotationRings } from './RotationRings.tsx';
import { RulerOverlay } from './RulerOverlay.tsx';
import { SkippedEdgesNotice } from './SkippedEdgesNotice.tsx';
import { selectedHandles, selectedRings } from './selectedShape.ts';
import { shapeDropHandlers } from './shapeDrop.ts';
import { skippedEdgeNotices } from './skippedEdges.ts';
import type { SurfaceTool } from './surfaceTool.ts';
import { ViewCube } from './ViewCube.tsx';
import { type PixelRect, Viewport } from './Viewport.ts';
import { ViewToolbar } from './ViewToolbar.tsx';
import { useViewKeys } from './viewKeys.ts';
import { WorkplaneTool } from './WorkplaneTool.tsx';

interface Props {
	design: Design;
	/** The imported models downloaded so far, by stored reference. */
	meshes: ReadonlyMap<string, MeshData>;
	selection: readonly NodeId[];
	onDropShape: (type: ShapeType, at: [number, number]) => void;
	/** The Workplane tool's plane, or null for the floor, and what to do when the tool picks one. */
	plane: WorkPlane | null;
	onPlane: (plane: WorkPlane | null) => void;
	onDropOnPlane: (type: ShapeType, plane: WorkPlane, point: Vec3) => void;
	onPick: (id: NodeId | null, additive: boolean, phase: 'down' | 'click') => void;
	onMoveStart: () => void;
	onMove: (delta: [number, number]) => void;
	onMoveEnd: () => void;
	onMarquee: (ids: NodeId[], additive: boolean) => void;
	onNudge: (delta: [number, number]) => void;
	/** True while the design is saved, so a picture of it can be taken for the designs list. */
	thumbnailReady: boolean;
	/** Receives that picture (a small PNG). */
	onThumbnail: (picture: Blob) => Promise<void>;
	/** A resize or lift handle is dragging the selected shape into this geometry. */
	onGeometry: (id: NodeId, geometry: ShapeGeometry) => void;
	/** A rotation ring is turning the selected shape into this orientation (row-major 3x3). */
	onRotation: (id: NodeId, rotation: number[]) => void;
	/** Removes chamfers or rounds whose edges an edit has removed (from the notice about them). */
	onRemoveEdges: (id: NodeId, ids: string[]) => void;
	/** The Select toggle (kept by the editor, which the Objects list needs it too). */
	multiSelect: boolean;
	onToggleMultiSelect: () => void;
	/** The Edge tool previews a node's treatments between onMoveStart and onMoveEnd (Apply), or onCancelDrag (Cancel). */
	onPreviewEdges: (id: NodeId, edges: EdgeTreatment[]) => void;
	onCancelDrag: () => void;
}

/** React host for the imperative three.js viewport, plus its overlay controls. */
export function ViewportCanvas(props: Props) {
	const { design, selection, meshes, onDropShape } = props;
	const hostRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<Viewport | null>(null);
	// The Viewport outlives renders, so it reads the latest props through this ref.
	const latest = useRef(props);
	latest.current = props;

	const serviceRef = useRef<GeometryService | null>(null);
	const evaluatorRef = useRef<WorkerEvaluator | null>(null);
	// Bumped whenever a group's computed shape arrives, so the scene is brought up to date.
	const [resultVersion, setResultVersion] = useState(0);
	const [failed, setFailed] = useState(false);
	const [marquee, setMarquee] = useState<PixelRect | null>(null);
	const [dimensionLabel, setDimensionLabel] = useState<string | null>(null);
	const [tool, setTool] = useState<SurfaceTool | null>(null);
	const toggleTool = (t: SurfaceTool) => setTool((now) => (now === t ? null : t));
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
		const service = serviceRef.current;
		viewport.setDesign(latest.current.design, service?.results(), service?.failed(), latest.current.meshes);
		viewport.setSelection(latest.current.selection);
		viewportRef.current = viewport;
		return () => {
			viewportRef.current = null;
			viewport.dispose();
		};
	}, [width, depth]);

	// Groups are drawn as the single mesh the holes leave behind, worked out off the main thread.
	// The worker (and its WebAssembly) only starts once a group actually needs working out.
	useEffect(() => {
		const evaluator = createWorkerEvaluator();
		evaluatorRef.current = evaluator;
		const service = new GeometryService(evaluator.evaluate, () => setResultVersion((v) => v + 1));
		serviceRef.current = service;
		service.update(latest.current.design, latest.current.meshes);
		return () => {
			serviceRef.current = null;
			evaluatorRef.current = null;
			service.dispose();
			evaluator.dispose();
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `resultVersion` is bumped when a group's computed shape arrives, to bring the scene up to date
	useEffect(() => {
		const service = serviceRef.current;
		service?.update(design, meshes);
		viewportRef.current?.setDesign(design, service?.results(), service?.failed(), meshes);
	}, [design, meshes, resultVersion]);

	// A picture of the design for the designs list, taken once it is saved and its shapes are worked out.
	const schedulerRef = useRef<ThumbnailScheduler | null>(null);
	useEffect(() => {
		const scheduler = new ThumbnailScheduler(async () => {
			const picture = await viewportRef.current?.snapshot();
			if (picture) await latest.current.onThumbnail(picture);
		});
		schedulerRef.current = scheduler;
		return () => {
			schedulerRef.current = null;
			scheduler.dispose();
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `resultVersion` changes when the geometry settles, which is when a picture may be due
	useEffect(() => {
		const modelsArrived = meshRefsIn(design, design.roots).every((ref) => meshes.has(ref));
		const settled = !serviceRef.current?.busy && modelsArrived;
		schedulerRef.current?.notify(props.thumbnailReady && !failed && settled, design);
	}, [design, meshes, resultVersion, props.thumbnailReady, failed]);

	useEffect(() => {
		viewportRef.current?.setSelection(selection);
	}, [selection]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: width and depth rebuild the Viewport, which starts without the marker
	useEffect(() => {
		viewportRef.current?.setPlaneMarker(props.plane);
	}, [props.plane, width, depth]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: width and depth rebuild the Viewport, which starts with the toggle off
	useEffect(() => {
		viewportRef.current?.setMultiSelect(props.multiSelect);
	}, [props.multiSelect, width, depth]);

	const getViewport = useCallback(() => viewportRef.current, []);
	const findEdges = useCallback(
		(subtree: Subtree, models: ReadonlyMap<string, MeshData>) =>
			evaluatorRef.current?.edges(subtree, models) ?? Promise.reject(new Error('The geometry worker is not running')),
		[],
	);

	useViewKeys({ viewport: viewportRef, camera: cameraRef, latest, onToggleTool: toggleTool });

	const { onDragOver, onDrop } = shapeDropHandlers(
		viewportRef,
		design.grid,
		onDropShape,
		props.plane && { plane: props.plane, onDrop: props.onDropOnPlane },
	);

	const { state, projection } = camera;
	const handles = selectedHandles(design, selection);
	const rings = selectedRings(design, selection);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target for shapes dragged from the Shapes panel (which can also add them by keyboard)
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
					<ViewToolbar
						viewport={viewportRef}
						projection={projection}
						tool={tool}
						multiSelect={props.multiSelect}
						onToggleMultiSelect={props.onToggleMultiSelect}
						onToggleTool={toggleTool}
						planeActive={props.plane !== null}
						onResetPlane={() => props.onPlane(null)}
					/>
					<ViewCube camera={state} onSelect={(view) => viewportRef.current?.setView(view)} />
					{!tool && handles && (
						<HandlesOverlay
							key={handles.id}
							nodeId={handles.id}
							geometry={handles.geometry}
							yaw={handles.yaw}
							lengthOnly={handles.lengthOnly}
							snap={design.grid.snap}
							getViewport={() => viewportRef.current}
							onStart={() => latest.current.onMoveStart()}
							onGeometry={(id, g) => latest.current.onGeometry(id, g)}
							onEnd={() => latest.current.onMoveEnd()}
							onLabel={setDimensionLabel}
						/>
					)}
					{!tool && rings && (
						<RotationRings
							key={`rings-${rings.id}`}
							nodeId={rings.id}
							center={rings.center}
							radius={rings.radius}
							rotation={rings.rotation}
							getViewport={() => viewportRef.current}
							onStart={() => latest.current.onMoveStart()}
							onRotation={(id, r) => latest.current.onRotation(id, r)}
							onEnd={() => latest.current.onMoveEnd()}
							onLabel={setDimensionLabel}
						/>
					)}
					{tool === 'workplane' && (
						<WorkplaneTool getViewport={() => viewportRef.current} onPlane={props.onPlane} onClose={() => setTool(null)} />
					)}
					{tool === 'edges' && (
						<EdgeTool
							getViewport={getViewport}
							design={design}
							meshes={meshes}
							selection={selection}
							findEdges={findEdges}
							camera={camera}
							onStart={() => latest.current.onMoveStart()}
							onPreview={(id, edges) => latest.current.onPreviewEdges(id, edges)}
							onApply={() => latest.current.onMoveEnd()}
							onCancel={() => latest.current.onCancelDrag()}
							onClose={() => setTool(null)}
						/>
					)}
					{tool === 'ruler' && (
						<RulerOverlay
							getViewport={() => viewportRef.current}
							units={design.units}
							snap={design.grid.snap}
							camera={camera}
							onClose={() => setTool(null)}
						/>
					)}
					<SkippedEdgesNotice
						notices={skippedEdgeNotices(design, serviceRef.current?.results() ?? new Map())}
						onRemove={(id, ids) => latest.current.onRemoveEdges(id, ids)}
					/>
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
