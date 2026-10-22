import {
	createSketchEditor,
	type Design,
	draftArc,
	draftLine,
	draftOutline,
	draftSpline,
	frameOfNode,
	frameOfPlane,
	fromFrame,
	type NodeId,
	type OrbitState,
	type SketchAction,
	type SketchEditorState,
	type SketchFrame,
	type SketchOutline,
	type SketchPoint,
	sketchReducer,
	sketchShown,
	toFrame,
	type WorkPlane,
} from '@holecraft/core';
import { useEffect, useReducer, useState } from 'react';
import { isTypingTarget } from '../keyboard.ts';
import type { Projection } from './CameraRig.ts';
import { SketchBar } from './SketchBar.tsx';
import { SketchOverlay } from './SketchOverlay.tsx';
import { sketchHint } from './sketchHint.ts';
import { usePlaneView } from './usePlaneView.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	design: Design;
	/** The Workplane tool's plane for a new sketch (the floor when none). */
	plane: WorkPlane | null;
	/** The sketch shape being redrawn, or null for a new sketch. */
	editId: NodeId | null;
	/** The camera now (it redraws the overlay when it moves, and is what the view goes back to afterwards). */
	camera: { state: OrbitState; projection: Projection };
	onFinish: (outlines: SketchOutline[], height: number, frame: SketchFrame) => void;
	onCancel: () => void;
}

const FLOOR: WorkPlane = { origin: [0, 0, 0], normal: [0, 0, 1] };
/** How near (pixels) a press must be to a point of the drawing to take hold of it. */
const REACH_PX = 10;
const DEFAULT_HEIGHT = 10;
const keyOf = (e: KeyboardEvent): SketchAction => ({ type: 'key', key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
const HANDLED_KEYS = new Set(['Enter', 'Backspace', 'Delete', 'Escape']);

/** What the Sketch tool works in: the frame (where the plane is and which way its x and y go), the drawing so far, and how thick to make it. */
function startOf(design: Design, plane: WorkPlane | null, editId: NodeId | null) {
	const node = editId ? design.nodes[editId] : undefined;
	if (node?.kind === 'shape' && node.shapeType === 'sketch') {
		return {
			frame: frameOfNode(node),
			outlines: sketchShown(node),
			height: String(Number(node.params.height)),
			size: Math.max(Number(node.params.width), Number(node.params.depth)) * 2.5,
		};
	}
	return {
		frame: frameOfPlane(plane ?? FLOOR),
		outlines: [],
		height: String(DEFAULT_HEIGHT),
		size: plane ? 120 : Math.max(...design.grid.size),
	};
}

/** The pointer and keys of drawing: presses on the view become plane points for the editor, and the keys it understands go to it first. */
function useSketchInput(getViewport: () => Viewport | null, frame: SketchFrame, dispatch: (a: SketchAction) => void) {
	useEffect(() => {
		const viewport = getViewport();
		if (!viewport) return;
		const el = viewport.element;
		const at = (e: PointerEvent): SketchPoint | null => {
			const world = viewport.pickPlane(e.clientX, e.clientY, frame.origin, frame.normal);
			return world ? toFrame(frame, world) : null;
		};
		const reach = () => REACH_PX / Math.max(viewport.pixelsPerMm(frame.origin), 1e-6);
		const onDown = (e: PointerEvent) => {
			const p = e.button === 0 ? at(e) : null;
			if (p) dispatch({ type: 'down', at: p, reach: reach() });
		};
		const onMove = (e: PointerEvent) => {
			const p = at(e);
			if (p) dispatch({ type: 'move', at: p, reach: reach() });
		};
		const onUp = (e: PointerEvent) => {
			const p = e.button === 0 ? at(e) : null;
			if (p) dispatch({ type: 'up', at: p });
		};
		// Keys the drawing understands are heard before the editor's own shortcuts (Ctrl+Z undoes the drawing, not the design).
		const onKey = (e: KeyboardEvent) => {
			const undoKey = (e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase());
			if (isTypingTarget(e.target) || !(undoKey || HANDLED_KEYS.has(e.key))) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			dispatch(keyOf(e));
		};
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', onUp);
		window.addEventListener('keydown', onKey, true);
		return () => {
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerup', onUp);
			window.removeEventListener('keydown', onKey, true);
		};
	}, [getViewport, frame, dispatch]);
}

/**
 * The Sketch tool: draw outlines on a plane (the floor, a face chosen with the Workplane tool, or a sketch shape's own plane), then Finish to make
 * a Sketch shape (or redraw the one being edited). The view looks straight at the plane meanwhile, with everything else faded, and goes back to
 * how it was on Finish or Cancel. The drawing's logic is `sketchReducer` (core), which is tested without a screen.
 */
export function SketchTool({ getViewport, design, plane, editId, camera, onFinish, onCancel }: Props) {
	const [start] = useState(() => startOf(design, plane, editId));
	const [state, dispatch] = useReducer(
		sketchReducer,
		start.outlines,
		(outlines): SketchEditorState => ({ ...createSketchEditor(outlines), tool: editId ? 'select' : 'rectangle' }),
	);
	const [height, setHeight] = useState(start.height);
	const [problem, setProblem] = useState<string | null>(null);
	const { frame } = start;

	usePlaneView(getViewport, frame, start.size, camera);
	useSketchInput(getViewport, frame, dispatch);

	const viewport = getViewport();
	const toScreen = (p: SketchPoint): [number, number] => {
		const at = viewport?.project(fromFrame(frame, p));
		return at ? [at.x, at.y] : [0, 0];
	};
	const finish = () => {
		const mm = Number(height);
		if (!(mm >= 0.1 && mm <= 1000)) return setProblem('The extrude height must be a number from 0.1 to 1000 mm');
		onFinish(state.outlines, mm, frame);
	};

	return (
		<>
			<SketchOverlay
				outlines={state.outlines}
				selected={state.selected}
				draftShape={draftOutline(state)}
				draftLine={state.tool === 'line' ? draftLine(state) : null}
				draftArc={draftArc(state)}
				draftSpline={draftSpline(state)}
				toScreen={toScreen}
			/>
			<SketchBar
				tool={state.tool}
				sides={state.sides}
				snap={state.snap}
				height={height}
				hint={problem ?? sketchHint(state)}
				canFinish={state.outlines.length > 0}
				canDelete={state.selected !== null}
				canReshape={state.selected !== null}
				editing={editId !== null}
				onTool={(tool) => dispatch({ type: 'tool', tool })}
				onSides={(sides) => dispatch({ type: 'sides', sides })}
				onSnap={(on) => dispatch({ type: 'snap', snap: on ? 1 : 0 })}
				onHeight={(text) => {
					setHeight(text);
					setProblem(null);
				}}
				onDelete={() => dispatch({ type: 'key', key: 'Delete' })}
				onStraighten={() => dispatch({ type: 'straighten' })}
				onSmooth={() => dispatch({ type: 'smooth' })}
				onCancel={onCancel}
				onFinish={finish}
			/>
		</>
	);
}
