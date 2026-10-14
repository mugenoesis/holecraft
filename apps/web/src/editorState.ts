import {
	type AlignEdge,
	type Axis,
	addLibraryShape,
	addMeshShape,
	addPaint,
	addPaletteColor,
	addShape,
	addShapeOnPlane,
	addSketchShape,
	alignNodes,
	type ChamferEdges,
	type CountersinkEnd,
	canPaint,
	canUndo,
	clearPaint,
	createHistory,
	type Design,
	deleteNodes,
	dropToWorkplane,
	duplicateNodes,
	type EdgeTreatment,
	flipNodes,
	groupNodes,
	type History,
	type MeshShapeInput,
	moveNodes,
	moveSelection,
	type NodeId,
	type PaintFill,
	pruneSelection,
	pushHistory,
	redo,
	removeEdgeTreatments,
	removePaletteColor,
	renameDesign,
	renameNode,
	repeatDuplicate,
	replacePresent,
	type ShapeGeometry,
	type ShapeType,
	type SketchOutline,
	type SolidMode,
	selectAll,
	setEdgeTreatments,
	setGroupSize,
	setHidden,
	setLocked,
	setNodeColor,
	setNodeEuler,
	setNodeMode,
	setNodePosition,
	setNodeRotation,
	setPaletteColor,
	setShapeChamfer,
	setShapeCountersink,
	setShapeGeometry,
	setShapeParam,
	setShapeSize,
	setShapeSketch,
	setShapeText,
	showAll,
	standOnPlane,
	suggestPaletteColor,
	toggleSelection,
	undo,
	ungroupNodes,
	type Vec3,
	type WorkPlane,
} from '@holecraft/core';

/** Where a duplicate lands relative to the original, in mm. */
const DUPLICATE_OFFSET: [number, number] = [10, 10];

export interface EditorState {
	history: History<Design>;
	selection: NodeId[];
	/** Set while a drag-move is in flight: the design it began from and the shapes being moved. */
	drag: { base: Design; ids: NodeId[] } | null;
	/** The last duplicate: what was copied and the copies made. Duplicating those copies again repeats whatever was done to them. */
	lastDuplicate: { sources: NodeId[]; copies: NodeId[] } | null;
	/** Groups holding a fastener whose stretching has been unlocked this session (never saved with the design, not an undo step). */
	unlockedStretch: NodeId[];
}

export type EditorAction =
	| { type: 'add'; shape: ShapeType; at: [number, number] }
	// A shape standing on the Workplane tool's plane (its base on the surface, going out of it) at a point on that plane.
	| { type: 'addOnPlane'; shape: ShapeType; plane: WorkPlane; point: Vec3 }
	// A saved shape (see libraryShapeOf) added to the design, on the floor at `at` or on a plane at `point`; it becomes the selection.
	// The Sketch tool: a new Sketch shape from a drawing made on a plane, or a sketch shape redrawn (outlines in its own frame), by `height` thick
	| { type: 'addSketch'; plane: WorkPlane; outlines: SketchOutline[]; height: number }
	| { type: 'setSketch'; id: NodeId; outlines: SketchOutline[]; height: number }
	| { type: 'addLibrary'; shape: Design; at?: [number, number]; plane?: WorkPlane; point?: Vec3 }
	// Put the one selected shape or group on the Workplane tool's plane (see standOnPlane).
	| { type: 'standOnPlane'; plane: WorkPlane }
	/** An imported model, already stored on the server (see importModel). */
	| { type: 'addMesh'; input: MeshShapeInput; at?: [number, number] }
	// 'down' is the pointer press; 'click' is the release when nothing was dragged.
	| { type: 'pick'; id: NodeId | null; additive: boolean; phase: 'down' | 'click' }
	| { type: 'marquee'; ids: NodeId[]; additive: boolean }
	| { type: 'selectAll' }
	| { type: 'clearSelection' }
	| { type: 'moveStart' }
	| { type: 'move'; delta: [number, number] }
	| { type: 'moveEnd' }
	// A resize or lift handle being dragged: previews the shape's whole geometry. Runs between
	// moveStart and moveEnd, like a move.
	| { type: 'setGeometry'; id: NodeId; geometry: ShapeGeometry }
	// Allow (or stop allowing) a group that holds a thread, nut, washer or standoff to be stretched; for this session only.
	| { type: 'setStretchUnlocked'; id: NodeId; unlocked: boolean }
	| { type: 'dropToPlane' }
	// The eye and padlock in the Objects list (by id, not the selection), and the "Show all" button.
	| { type: 'setHidden'; ids: NodeId[]; hidden: boolean }
	| { type: 'setLocked'; ids: NodeId[]; locked: boolean }
	| { type: 'showAll' }
	// Line the selection up on one axis (needs two or more objects), or mirror it across one.
	| { type: 'align'; axis: Axis; edge: AlignEdge }
	| { type: 'flip'; axis: Axis }
	| { type: 'group' }
	| { type: 'ungroup' }
	| { type: 'renameDesign'; name: string }
	// Solid or hole, for everything selected.
	| { type: 'setMode'; mode: SolidMode }
	// A rotation ring being dragged: previews the shape's orientation (a row-major 3x3). Runs
	// between moveStart and moveEnd, like a move.
	| { type: 'setRotation'; id: NodeId; rotation: number[] }
	// Typed rotation in degrees (X, then Y, then Z).
	| { type: 'setEuler'; id: NodeId; euler: [number, number, number] }
	// The Edge tool: previews a node's edge treatments between moveStart and moveEnd (Apply), or cancelDrag (Cancel).
	| { type: 'previewEdges'; id: NodeId; edges: EdgeTreatment[] }
	// The Paint tool's brush: a stroke on one shape, grown by previewPaint between paintStart and moveEnd (or cancelDrag).
	| { type: 'paintStart'; id: NodeId }
	| { type: 'previewPaint'; id: NodeId; fill: PaintFill }
	// The colour wheel: colourStart begins a drag (with or without a selection), previewColor / previewPalette show a colour
	// on the shapes as it is dragged, moveEnd keeps the last one as one undo step and cancelDrag takes it back.
	| { type: 'colourStart' }
	| { type: 'previewColor'; ids: NodeId[]; color: string }
	| { type: 'previewPalette'; slot: number; color: string }
	| { type: 'cancelDrag' }
	| { type: 'removeEdges'; id: NodeId; ids: string[] }
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'delete' }
	| { type: 'duplicate' }
	| { type: 'nudge'; delta: [number, number] }
	| { type: 'setPosition'; id: NodeId; at: [number, number, number?] }
	| { type: 'setSize'; id: NodeId; size: Partial<Record<'width' | 'depth' | 'height', number>> }
	// A group's width, depth and/or height in mm, stretching what is inside to fit.
	| { type: 'setGroupSize'; id: NodeId; size: Partial<Record<'width' | 'depth' | 'height', number>> }
	// A box's or cylinder's chamfer in mm (0 removes it) and/or which edges it is on.
	| { type: 'setChamfer'; id: NodeId; size?: number; edges?: ChamferEdges }
	// A cylinder hole's countersink in mm (0 removes it) and/or which end it flares.
	| { type: 'setCountersink'; id: NodeId; size?: number; end?: CountersinkEnd }
	// One of a shape's own settings in mm (a tube's wall, a ring's thickness).
	| { type: 'setShapeParam'; id: NodeId; key: string; value: number }
	| { type: 'setShapeText'; id: NodeId; text: string }
	| { type: 'addPaint'; id: NodeId; fill: PaintFill }
	// one fill (a gap fill) on several shapes, as one undo step
	| { type: 'addPaintAll'; ids: NodeId[]; fill: PaintFill }
	| { type: 'clearPaint'; ids: NodeId[] }
	| { type: 'rename'; id: NodeId; name: string }
	| { type: 'setColor'; ids: NodeId[]; color: string }
	/** Adds a filament colour to the palette (a suggested one when none is given). */
	| { type: 'paletteAdd'; color?: string }
	/** Changes a palette slot, and everything coloured with it. */
	| { type: 'paletteSet'; slot: number; color: string }
	| { type: 'paletteRemove'; slot: number };

export const canUndoState = (state: EditorState): boolean => canUndo(state.history);

export function createEditorState(design: Design): EditorState {
	return { history: createHistory(design), selection: [], drag: null, lastDuplicate: null, unlockedStretch: [] };
}

/** Records `next` as a new undoable step; returns `state` itself when nothing changed. */
function commit(state: EditorState, next: Design, selection: NodeId[] = state.selection): EditorState {
	const history = pushHistory(state.history, next);
	if (history === state.history) return state;
	return { ...state, history, selection: pruneSelection(next, selection) };
}

type ActionOf<T extends EditorAction['type']> = Extract<EditorAction, { type: T }>;
type SelectionAction = ActionOf<'pick' | 'marquee' | 'selectAll' | 'clearSelection'>;
type DragAction = ActionOf<
	'moveStart' | 'move' | 'moveEnd' | 'setGeometry' | 'setRotation' | 'previewEdges' | 'paintStart' | 'previewPaint' | 'cancelDrag'
>;
/** The colour wheel's drag: like any other drag it ends with moveEnd or cancelDrag. */
type ColourDragAction = ActionOf<'colourStart' | 'previewColor' | 'previewPalette'>;
type HistoryAction = ActionOf<'undo' | 'redo'>;
type StretchLockAction = ActionOf<'setStretchUnlocked'>;
/** Everything else: edits to the document itself, each one an undoable step. */
type EditAction = Exclude<EditorAction, SelectionAction | DragAction | ColourDragAction | HistoryAction | StretchLockAction>;

/** Allowing (or stopping) the stretch of a group that holds a fastener: a setting of this editing session, not part of the document or its history. */
function reduceStretchLock(state: EditorState, action: StretchLockAction): EditorState {
	if (state.unlockedStretch.includes(action.id) === action.unlocked) return state;
	const unlockedStretch = action.unlocked ? [...state.unlockedStretch, action.id] : state.unlockedStretch.filter((id) => id !== action.id);
	return { ...state, unlockedStretch };
}

/** Changes to what is selected. */
function reduceSelection(state: EditorState, action: SelectionAction): EditorState {
	switch (action.type) {
		case 'pick': {
			if (action.phase === 'down') {
				return { ...state, selection: toggleSelection(state.selection, action.id, action.additive, { keepGroup: true }) };
			}
			if (action.id === null || action.additive) return state;
			return state.selection.length === 1 && state.selection[0] === action.id ? state : { ...state, selection: [action.id] };
		}

		case 'marquee': {
			const selection = action.additive ? [...state.selection, ...action.ids.filter((id) => !state.selection.includes(id))] : action.ids;
			return { ...state, selection };
		}

		case 'selectAll':
			return { ...state, selection: selectAll(state.history.present) };

		case 'clearSelection':
			return state.selection.length ? { ...state, selection: [] } : state;
	}
}

/** Drags (moving, resizing, turning): live previews that become one undo step when the drag ends. */
function reduceDrag(state: EditorState, action: DragAction): EditorState {
	const design = state.history.present;

	switch (action.type) {
		case 'moveStart':
			return state.drag || state.selection.length === 0 ? state : { ...state, drag: { base: design, ids: [...state.selection] } };

		case 'move': {
			if (!state.drag) return state;
			const { base, ids } = state.drag;
			const next = moveSelection(base, ids, action.delta, { snap: base.grid.snap, size: base.grid.size });
			return { ...state, history: replacePresent(state.history, next) };
		}

		case 'moveEnd': {
			if (!state.drag) return state;
			// The whole drag becomes a single undo step back to where it began.
			return { ...state, history: pushHistory(state.history, design, state.drag.base), drag: null };
		}

		case 'setGeometry':
			return preview(state, action.id, (base) =>
				setShapeGeometry(base, action.id, action.geometry, undefined, { fasteners: state.unlockedStretch.includes(action.id) }),
			);

		case 'setRotation':
			return preview(state, action.id, (base) => setNodeRotation(base, action.id, action.rotation));

		case 'previewEdges':
			return preview(state, action.id, (base) => setEdgeTreatments(base, action.id, action.edges));

		case 'paintStart':
			return state.drag || !canPaint(design, action.id) ? state : { ...state, drag: { base: design, ids: [action.id] } };

		case 'previewPaint':
			return preview(state, action.id, (base) => addPaint(base, action.id, action.fill));

		case 'cancelDrag':
			return state.drag ? { ...state, history: replacePresent(state.history, state.drag.base), drag: null } : state;
	}
}

/** The colour wheel: shows a colour on the design the drag began from, with or without a selection. */
function reduceColourDrag(state: EditorState, action: ColourDragAction): EditorState {
	const design = state.history.present;
	switch (action.type) {
		case 'colourStart':
			return state.drag ? state : { ...state, drag: { base: design, ids: [...state.selection] } };

		case 'previewColor':
			return state.drag
				? { ...state, history: replacePresent(state.history, setNodeColor(state.drag.base, action.ids, action.color)) }
				: state;

		case 'previewPalette':
			return state.drag
				? { ...state, history: replacePresent(state.history, setPaletteColor(state.drag.base, action.slot, action.color)) }
				: state;
	}
}

/** Shows `edit` applied to the design the drag began from (handles, rings, the Edge tool), if `id` is part of the drag. */
function preview(state: EditorState, id: NodeId, edit: (base: Design) => Design): EditorState {
	if (!state.drag?.ids.includes(id)) return state;
	return { ...state, history: replacePresent(state.history, edit(state.drag.base)) };
}

/** Undo and redo (ignored while a drag is in progress). */
function reduceHistory(state: EditorState, action: HistoryAction): EditorState {
	if (state.drag) return state;
	const history = action.type === 'undo' ? undo(state.history) : redo(state.history);
	if (history === state.history) return state;
	return { ...state, history, selection: pruneSelection(history.present, state.selection) };
}

/** Ctrl+D: a copy offset from the original, or, on the copies of the last duplicate, one more step of whatever was done to them. */
function duplicate(state: EditorState): EditorState {
	const design = state.history.present;
	const last = state.lastDuplicate;
	const again = last && sameIds(last.copies, state.selection) ? repeatDuplicate(design, last.sources, last.copies) : null;
	const copy = again?.ids.length ? again : duplicateNodes(design, state.selection, DUPLICATE_OFFSET);
	if (!copy.ids.length) return state;
	const sources = again?.ids.length ? last!.copies : state.selection;
	const next = commit(state, copy.design, copy.ids);
	return { ...next, lastDuplicate: { sources: [...sources], copies: copy.ids } };
}

const sameIds = (a: readonly NodeId[], b: readonly NodeId[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/** Adding something new: a built-in shape, a saved one, or an imported model. */
function reduceAdd(state: EditorState, action: ActionOf<'add' | 'addOnPlane' | 'addLibrary' | 'addMesh' | 'addSketch'>): EditorState {
	const design = state.history.present;
	switch (action.type) {
		case 'add':
			return commit(state, addShape(design, action.shape, action.at).design);

		case 'addOnPlane': {
			const added = addShapeOnPlane(design, action.shape, action.plane, action.point);
			return added.id ? commit(state, added.design) : state; // like adding on the floor, the selection is left alone
		}

		case 'addLibrary': {
			const added = addLibraryShape(design, action.shape, {
				...(action.at && { at: action.at }),
				...(action.plane && { plane: action.plane }),
				...(action.point && { point: action.point }),
			});
			return added.id ? commit(state, added.design, [added.id]) : state;
		}

		case 'addMesh': {
			const added = addMeshShape(design, action.input, { at: action.at });
			return commit(state, added.design, [added.id]);
		}

		case 'addSketch': {
			const added = addSketchShape(design, action.plane, action.outlines, action.height);
			return added.id ? commit(state, added.design, [added.id]) : state;
		}
	}
}

/** Edits to the document: each is one undoable step, or nothing at all when it changes nothing. */
function reduceEdit(state: EditorState, action: EditAction): EditorState {
	const design = state.history.present;

	switch (action.type) {
		case 'add':
		case 'addOnPlane':
		case 'addLibrary':
		case 'addMesh':
		case 'addSketch':
			return reduceAdd(state, action);

		case 'setSketch':
			return commit(state, setShapeSketch(design, action.id, action.outlines, { height: action.height }));

		case 'setEuler':
			return commit(state, setNodeEuler(design, action.id, action.euler));

		case 'removeEdges':
			return commit(state, removeEdgeTreatments(design, action.id, action.ids));

		case 'dropToPlane':
			return commit(state, dropToWorkplane(design, state.selection));

		case 'setHidden': {
			const next = setHidden(design, action.ids, action.hidden);
			// A hidden object can't stay selected: you could still move or delete what you can't see.
			return commit(
				state,
				next,
				state.selection.filter((id) => !next.nodes[id]?.hidden),
			);
		}

		case 'setLocked':
			return commit(state, setLocked(design, action.ids, action.locked));

		case 'showAll':
			return commit(state, showAll(design));

		case 'align':
			return commit(state, alignNodes(design, state.selection, action.axis, action.edge));

		case 'flip':
			return commit(state, flipNodes(design, state.selection, action.axis));

		case 'group': {
			const grouped = groupNodes(design, state.selection);
			return grouped.id ? commit(state, grouped.design, [grouped.id]) : state;
		}

		case 'ungroup': {
			const freed = ungroupNodes(design, state.selection);
			return freed.ids.length ? commit(state, freed.design, freed.ids) : state;
		}

		case 'setMode':
			return commit(state, setNodeMode(design, state.selection, action.mode));

		case 'renameDesign':
			return commit(state, renameDesign(design, action.name));

		case 'delete':
			return commit(state, deleteNodes(design, state.selection), []);

		case 'duplicate':
			return duplicate(state);

		case 'nudge':
			return commit(state, moveNodes(design, state.selection, [action.delta[0], action.delta[1], 0]));

		case 'setPosition':
			return commit(state, setNodePosition(design, action.id, action.at));

		case 'standOnPlane':
			return state.selection.length === 1 ? commit(state, standOnPlane(design, state.selection[0]!, action.plane)) : state;

		case 'setSize':
			return commit(state, setShapeSize(design, action.id, action.size));

		case 'setGroupSize':
			return commit(
				state,
				setGroupSize(design, action.id, action.size, undefined, { fasteners: state.unlockedStretch.includes(action.id) }),
			);

		case 'setChamfer':
			return commit(
				state,
				setShapeChamfer(design, action.id, {
					...(action.size !== undefined && { size: action.size }),
					...(action.edges && { edges: action.edges }),
				}),
			);

		case 'setShapeParam':
			return commit(state, setShapeParam(design, action.id, action.key, action.value));

		case 'addPaint':
			return commit(state, addPaint(design, action.id, action.fill));

		case 'addPaintAll':
			return commit(
				state,
				action.ids.reduce((d, id) => addPaint(d, id, action.fill), design),
			);

		case 'clearPaint':
			return commit(
				state,
				action.ids.reduce((d, id) => clearPaint(d, id), design),
			);

		case 'setShapeText':
			return commit(state, setShapeText(design, action.id, action.text));

		case 'setCountersink':
			return commit(
				state,
				setShapeCountersink(design, action.id, {
					...(action.size !== undefined && { size: action.size }),
					...(action.end && { end: action.end }),
				}),
			);

		case 'rename':
			return commit(state, renameNode(design, action.id, action.name));

		case 'paletteAdd':
			return commit(state, addPaletteColor(design, action.color ?? suggestPaletteColor(design.palette)));

		case 'paletteSet':
			return commit(state, setPaletteColor(design, action.slot, action.color));

		case 'paletteRemove':
			return commit(state, removePaletteColor(design, action.slot));

		case 'setColor':
			return commit(state, setNodeColor(design, action.ids, action.color));
	}
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
	switch (action.type) {
		case 'pick':
		case 'marquee':
		case 'selectAll':
		case 'clearSelection':
			return reduceSelection(state, action);

		case 'moveStart':
		case 'move':
		case 'moveEnd':
		case 'setGeometry':
		case 'setRotation':
		case 'previewEdges':
		case 'paintStart':
		case 'previewPaint':
		case 'cancelDrag':
			return reduceDrag(state, action);

		case 'colourStart':
		case 'previewColor':
		case 'previewPalette':
			return reduceColourDrag(state, action);

		case 'undo':
		case 'redo':
			return reduceHistory(state, action);

		case 'setStretchUnlocked':
			return reduceStretchLock(state, action);

		default:
			return reduceEdit(state, action);
	}
}
