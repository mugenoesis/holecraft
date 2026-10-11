import {
	addMeshShape,
	addPaletteColor,
	addShape,
	canUndo,
	createHistory,
	type Design,
	deleteNodes,
	dropToWorkplane,
	duplicateNodes,
	groupNodes,
	type History,
	type MeshShapeInput,
	moveNodes,
	moveSelection,
	type NodeId,
	pruneSelection,
	pushHistory,
	redo,
	removePaletteColor,
	renameDesign,
	renameNode,
	replacePresent,
	type ShapeGeometry,
	type ShapeType,
	type SolidMode,
	selectAll,
	setNodeColor,
	setNodeEuler,
	setNodeMode,
	setNodePosition,
	setNodeRotation,
	setPaletteColor,
	setShapeGeometry,
	setShapeSize,
	suggestPaletteColor,
	toggleSelection,
	undo,
	ungroupNodes,
} from '@holecraft/core';

/** Where a duplicate lands relative to the original, in mm. */
export const DUPLICATE_OFFSET: [number, number] = [10, 10];

export interface EditorState {
	history: History<Design>;
	selection: NodeId[];
	/** Set while a drag-move is in flight: the design it began from and the shapes being moved. */
	drag: { base: Design; ids: NodeId[] } | null;
}

export type EditorAction =
	| { type: 'add'; shape: ShapeType; at: [number, number] }
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
	| { type: 'dropToPlane' }
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
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'delete' }
	| { type: 'duplicate' }
	| { type: 'nudge'; delta: [number, number] }
	| { type: 'setPosition'; id: NodeId; at: [number, number, number?] }
	| { type: 'setSize'; id: NodeId; size: Partial<Record<'width' | 'depth' | 'height', number>> }
	| { type: 'rename'; id: NodeId; name: string }
	| { type: 'setColor'; ids: NodeId[]; color: string }
	/** Adds a filament colour to the palette (a suggested one when none is given). */
	| { type: 'paletteAdd'; color?: string }
	/** Changes a palette slot, and everything coloured with it. */
	| { type: 'paletteSet'; slot: number; color: string }
	| { type: 'paletteRemove'; slot: number };

export const canUndoState = (state: EditorState): boolean => canUndo(state.history);

export function createEditorState(design: Design): EditorState {
	return { history: createHistory(design), selection: [], drag: null };
}

/** Records `next` as a new undoable step; returns `state` itself when nothing changed. */
function commit(state: EditorState, next: Design, selection: NodeId[] = state.selection): EditorState {
	const history = pushHistory(state.history, next);
	if (history === state.history) return state;
	return { ...state, history, selection: pruneSelection(next, selection) };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
	const design = state.history.present;

	switch (action.type) {
		case 'add':
			return commit(state, addShape(design, action.shape, action.at).design);

		case 'addMesh': {
			const added = addMeshShape(design, action.input, { at: action.at });
			return commit(state, added.design, [added.id]);
		}

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
			return { ...state, selection: selectAll(design) };

		case 'clearSelection':
			return state.selection.length ? { ...state, selection: [] } : state;

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

		case 'setGeometry': {
			if (!state.drag || !state.drag.ids.includes(action.id)) return state;
			return { ...state, history: replacePresent(state.history, setShapeGeometry(state.drag.base, action.id, action.geometry)) };
		}

		case 'setRotation': {
			if (!state.drag || !state.drag.ids.includes(action.id)) return state;
			return { ...state, history: replacePresent(state.history, setNodeRotation(state.drag.base, action.id, action.rotation)) };
		}

		case 'setEuler':
			return commit(state, setNodeEuler(design, action.id, action.euler));

		case 'dropToPlane':
			return commit(state, dropToWorkplane(design, state.selection));

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

		case 'undo':
		case 'redo': {
			if (state.drag) return state;
			const history = action.type === 'undo' ? undo(state.history) : redo(state.history);
			if (history === state.history) return state;
			return { ...state, history, selection: pruneSelection(history.present, state.selection) };
		}

		case 'delete': {
			const next = deleteNodes(design, state.selection);
			return commit(state, next, []);
		}

		case 'duplicate': {
			const copy = duplicateNodes(design, state.selection, DUPLICATE_OFFSET);
			return copy.ids.length ? commit(state, copy.design, copy.ids) : state;
		}

		case 'nudge':
			return commit(state, moveNodes(design, state.selection, [action.delta[0], action.delta[1], 0]));

		case 'setPosition':
			return commit(state, setNodePosition(design, action.id, action.at));

		case 'setSize':
			return commit(state, setShapeSize(design, action.id, action.size));

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
