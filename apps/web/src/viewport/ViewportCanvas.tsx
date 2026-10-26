import {
	type Design,
	type EdgeTreatment,
	HOME_VIEW,
	hasThreads,
	type MeshData,
	type NodeId,
	type OrbitState,
	type PaintFill,
	type ShapeGeometry,
	type ShapeType,
	type SketchFrame,
	type SketchOutline,
	type Vec3,
	type WorkPlane,
	withSimpleThreads,
	type ZeroPoint,
	type ZeroTurns,
} from '@holecraft/core';
import { meshRefsIn, type Subtree } from '@holecraft/geometry';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EngraveRequest } from '../engraveJob.ts';
import { GeometryService } from '../geometry/GeometryService.ts';
import { createWorkerEvaluator, type WorkerEvaluator } from '../geometry/workerEvaluator.ts';
import type { Placing } from '../placing.ts';
import { ThumbnailScheduler } from '../thumbnailScheduler.ts';
import type { EngraveEditJob } from '../useEngrave.ts';
import type { Projection } from './CameraRig.ts';
import type { CavityShape } from './cavityMarkers.ts';
import { EdgeTool } from './EdgeTool.tsx';
import { EngraveHost } from './EngraveTool.tsx';
import { editedNodeIds, withoutNodes } from './editedNodes.ts';
import { HandlesOverlay } from './HandlesOverlay.tsx';
import { MeasureLayers } from './MeasureLayers.tsx';
import { PaintTool } from './PaintTool.tsx';
import { PlaceLayer, useToolState } from './PlaceTool.tsx';
import type { PlacementTarget } from './placement.ts';
import { RotationRings } from './RotationRings.tsx';
import { RulerOverlay } from './RulerOverlay.tsx';
import { SketchTool } from './SketchTool.tsx';
import { SkippedEdgesNotice } from './SkippedEdgesNotice.tsx';
import { SupportsLayer } from './SupportsLayer.tsx';
import { selectedHandles, selectedRings } from './selectedShape.ts';
import { shapeDropHandlers } from './shapeDrop.ts';
import { skippedEdgeNotices } from './skippedEdges.ts';
import type { SupportsView } from './supportsView.ts';
import { useSimpleThreads } from './useSimpleThreads.ts';
import { useToolEdit } from './useToolEdit.ts';
import { useXray } from './useXray.ts';
import { ViewCube } from './ViewCube.tsx';
import { type PixelRect, Viewport } from './Viewport.ts';
import { ViewToolbar } from './ViewToolbar.tsx';
import { useViewKeys } from './viewKeys.ts';
import { WorkplaneTool } from './WorkplaneTool.tsx';
import { XrayBar } from './XrayBar.tsx';

interface Props {
	design: Design;
	/** The imported models downloaded so far, by stored reference. */
	meshes: ReadonlyMap<string, MeshData>;
	selection: readonly NodeId[];
	/** Groups holding a fastener whose stretching has been unlocked this session (they get handles). */
	unlockedStretch: readonly NodeId[];
	onDropShape: (type: ShapeType, at: [number, number]) => void;
	/** A saved shape dropped from the Mine view of the Shapes panel. */
	onDropSaved: (id: string, where: { at: [number, number] } | { plane: WorkPlane; point: Vec3 }) => void;
	/** What is armed to be put down with the next click on the plate (the Shapes panel arms it), what to do with that click, and how to let go of it. */
	placing: Placing | null;
	/** A finger is dragging the lifted shape: the ghost follows it, and it is put down where the finger comes up (over the view; anywhere else lets go). */
	dragging: boolean;
	onPlace: (placing: Placing, target: PlacementTarget) => void;
	onCancelPlacing: () => void;
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
	/** Types a size (mm) for the one selected shape or group. */
	onSize: (id: string, group: boolean, size: Partial<Record<'width' | 'depth' | 'height', number>>) => void;
	/** Puts the zero point at a spot with the L's quarter turns, or takes it away (null). */
	onZero: (at: ZeroPoint | null, turns: ZeroTurns) => void;
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
	/** The Paint tool put a fill on an object, or erased all the paint on some. */
	onPaint: (id: NodeId, fill: PaintFill) => void;
	onErasePaint: (ids: NodeId[]) => void;
	/** A brush stroke on an object: begin, grow (the same fill, more dabs), end. */
	onPaintStrokeStart: (id: NodeId) => void;
	onPaintStrokePreview: (id: NodeId, fill: PaintFill) => void;
	onPaintStrokeEnd: () => void;
	/** A gap fill, on the shapes it can tidy. */
	onPaintGapFill: (ids: NodeId[], fill: PaintFill) => void;
	/** The compact layout (touch screens, narrow windows): the view toolbar tucks its tools into a menu. */
	compact: boolean;
	/** Buttons for the selection, shown over the bottom of the view while no tool is (tools have their own bar there). */
	selectionBar?: ReactNode;
	/** The sketch shape being redrawn (set by its Edit sketch button), or null; the tool tells when it is done. */
	/** The support points to show and edit over the model, when the design has any (or Add point is on). */
	supports?: SupportsView;
	/** The closed cavities to draw in the model (none to hide them), the chosen one, and what a click through one does. */
	cavities?: { list: readonly CavityShape[]; selected: number | null; onSelect: (id: number) => void } | undefined;
	sketchEdit: NodeId | null;
	onSketchEditChange: (id: NodeId | null) => void;
	/** A drawing is finished: make a new Sketch shape on the frame's plane, or redraw `editId`. */
	onFinishSketch: (done: { outlines: SketchOutline[]; height: number; frame: SketchFrame; editId: NodeId | null }) => void;
	/** Lettering is placed on a surface and Done was pressed: fit it to the shape and put it in the design; null when that worked, else the problem. */
	onEngrave: (request: EngraveRequest, edit?: EngraveEditJob) => Promise<string | null>;
	/** The engraving being edited (its group and shape; set by Properties' Edit engraving), or null; the tool tells when it is done. */
	engraveEdit: { group: NodeId; node: NodeId } | null;
	onEngraveEditChange: (edit: { group: NodeId; node: NodeId } | null) => void;
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
	// The tool in use, and a shape armed to be put down: both own the left button, so choosing one lets go of the other.
	const { tool, setTool, toggleTool } = useToolState(props.placing, props.onCancelPlacing);
	// What the ghost of a shape being placed is while it is on show (read by the tests, like the camera).
	const [ghost, setGhost] = useState<string | undefined>(undefined);
	// Edit sketch and Edit engraving (in Properties) turn their tool on for that shape; leaving the tool by any way lets go of it
	const { sketchEdit, onSketchEditChange, engraveEdit, onEngraveEditChange } = props;
	useToolEdit(sketchEdit !== null, tool, 'sketch', setTool, () => onSketchEditChange(null));
	useToolEdit(engraveEdit !== null, tool, 'engrave', setTool, () => onEngraveEditChange(null));
	const [camera, setCamera] = useState<{ state: OrbitState; projection: Projection }>({ state: HOME_VIEW, projection: 'perspective' });
	const cameraRef = useRef(camera);
	cameraRef.current = camera;

	// While editing, threads can be drawn as plain cylinders: only the view and its geometry work use this; selection, saving and export use `design`
	const [simpleThreads, toggleSimpleThreads] = useSimpleThreads();
	const x = useXray(design);
	// the sketch shape being redrawn, or the engraving being edited, is left out of the view: its drawing or lettering is on screen instead
	const edited = editedNodeIds(tool, sketchEdit, engraveEdit);
	const editedKey = edited.join(',');
	// biome-ignore lint/correctness/useExhaustiveDependencies: editedKey stands for the ids, so a new array with the same ids does not redraw
	const drawn = useMemo(() => withoutNodes(simpleThreads ? withSimpleThreads(design) : design, edited), [design, simpleThreads, editedKey]);
	const drawnRef = useRef(drawn);
	drawnRef.current = drawn;

	const [width, depth] = design.grid.size;

	// The workplane's size changes in the open view (the next effect), so the size here is only the one the view starts with.
	// biome-ignore lint/correctness/useExhaustiveDependencies: a change of size must not start the view afresh
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
				onCavityPick: (id) => latest.current.cavities?.onSelect(id),
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
		viewport.setDesign(drawnRef.current, service?.results(), service?.failed(), latest.current.meshes);
		viewport.setSelection(latest.current.selection);
		viewportRef.current = viewport;
		return () => {
			viewportRef.current = null;
			viewport.dispose();
		};
	}, []);

	useEffect(() => {
		viewportRef.current?.setWorkplaneSize(width, depth);
	}, [width, depth]);

	// Groups are drawn as the single mesh the holes leave behind, worked out off the main thread.
	// The worker (and its WebAssembly) only starts once a group actually needs working out.
	useEffect(() => {
		const evaluator = createWorkerEvaluator();
		evaluatorRef.current = evaluator;
		const service = new GeometryService(evaluator.evaluate, () => setResultVersion((v) => v + 1));
		serviceRef.current = service;
		service.update(drawnRef.current, latest.current.meshes);
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
		service?.update(drawn, meshes);
		viewportRef.current?.setDesign(drawn, service?.results(), service?.failed(), meshes);
	}, [drawn, meshes, resultVersion]);

	const cavityList = props.cavities?.list;
	const cavitySelected = props.cavities?.selected ?? null;
	useEffect(() => {
		viewportRef.current?.setCavityMarkers(cavityList ?? null, cavitySelected);
	}, [cavityList, cavitySelected]);

	// X-ray changes only how the view is drawn
	useEffect(() => {
		viewportRef.current?.setXray(x.xray);
	}, [x.xray]);

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
		(subtree: Subtree, models: ReadonlyMap<string, MeshData>, treated?: boolean) =>
			evaluatorRef.current?.edges(subtree, models, treated) ?? Promise.reject(new Error('The geometry worker is not running')),
		[],
	);

	useViewKeys({ viewport: viewportRef, camera: cameraRef, latest, onToggleTool: toggleTool });

	const { onDragOver, onDrop } = shapeDropHandlers(
		viewportRef,
		design.grid,
		onDropShape,
		{ plane: props.plane, onDrop: props.onDropOnPlane },
		props.onDropSaved,
	);

	const { state, projection } = camera;
	const handles = selectedHandles(design, selection, props.unlockedStretch);
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
			data-ghost={ghost}
			data-workplane={`${width}x${depth}`}
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
						hasThreads={hasThreads(design)}
						simpleThreads={simpleThreads}
						onToggleSimpleThreads={toggleSimpleThreads}
						xrayOn={x.on}
						onToggleXray={x.toggle}
						compact={props.compact}
					/>
					{x.on && (
						<XrayBar
							seeThrough={x.seeThrough}
							axis={x.axis}
							at={x.at}
							range={x.range}
							onSeeThrough={x.setSeeThrough}
							onAxis={x.setAxis}
							onAt={x.setAt}
						/>
					)}
					{!tool && props.selectionBar}
					<ViewCube camera={state} onSelect={(view) => viewportRef.current?.setView(view)} />
					<SupportsLayer supports={props.supports} active={!tool} getViewport={getViewport} camera={camera} />
					{!tool && handles && (
						<HandlesOverlay
							key={handles.id}
							nodeId={handles.id}
							geometry={handles.geometry}
							yaw={handles.yaw}
							rotation={handles.rotation}
							tilted={handles.tilted}
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
					<PlaceLayer
						getViewport={getViewport}
						placing={props.placing}
						dragging={props.dragging}
						grid={design.grid}
						plane={props.plane}
						onPlace={(placing, target) => latest.current.onPlace(placing, target)}
						onCancel={() => latest.current.onCancelPlacing()}
						onGhost={setGhost}
					/>
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
					{tool === 'sketch' && (
						<SketchTool
							// a different sketch (or a new one) starts the tool afresh
							key={sketchEdit ?? 'new'}
							getViewport={getViewport}
							design={design}
							plane={props.plane}
							editId={sketchEdit}
							camera={camera}
							onFinish={(outlines, height, frame) => {
								latest.current.onFinishSketch({ outlines, height, frame, editId: sketchEdit });
								setTool(null);
							}}
							onCancel={() => setTool(null)}
						/>
					)}
					<EngraveHost
						active={tool === 'engrave'}
						getViewport={getViewport}
						design={design}
						camera={camera}
						edit={engraveEdit}
						onEngrave={(request, job) => latest.current.onEngrave(request, job)}
						onClose={() => setTool(null)}
					/>
					{tool === 'paint' && (
						<PaintTool
							getViewport={getViewport}
							design={design}
							selection={selection}
							onPaint={(id, fill) => latest.current.onPaint(id, fill)}
							onStrokeStart={(id) => latest.current.onPaintStrokeStart(id)}
							onStrokePreview={(id, fill) => latest.current.onPaintStrokePreview(id, fill)}
							onStrokeEnd={() => latest.current.onPaintStrokeEnd()}
							onGapFill={(ids, fill) => latest.current.onPaintGapFill(ids, fill)}
							onEraseAll={(ids) => latest.current.onErasePaint(ids)}
							onClose={() => setTool(null)}
						/>
					)}
					<MeasureLayers
						getViewport={() => viewportRef.current}
						design={design}
						selection={selection}
						camera={camera}
						zeroTool={tool === 'zero'}
						noTool={tool === null}
						onNudge={props.onNudge}
						onSize={props.onSize}
						onZero={props.onZero}
						onCloseTool={() => setTool(null)}
					/>
					{tool === 'ruler' && (
						<RulerOverlay
							getViewport={() => viewportRef.current}
							units={design.units}
							snap={design.grid.snap}
							design={design}
							meshes={meshes}
							findEdges={findEdges}
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
