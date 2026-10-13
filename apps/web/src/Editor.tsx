import type { Design, NodeId, ShapeType, Vec3, WorkPlane } from '@holecraft/core';
import { useCallback, useEffect, useReducer, useState } from 'react';
import { ArrangePanel } from './ArrangePanel.tsx';
import { type PanelTab, useCompactLayout, usePanelTab } from './compactLayout.ts';
import { ApiError, getDesign, uploadThumbnail } from './designsApi.ts';
import { useEditorShortcuts } from './editorShortcuts.ts';
import { createEditorState, editorReducer } from './editorState.ts';
import { NotFound } from './NotFound.tsx';
import { PalettePanel } from './PalettePanel.tsx';
import { PanelTabs } from './PanelTabs.tsx';
import { PropertiesPanel } from './PropertiesPanel.tsx';
import { SelectionBar } from './SelectionBar.tsx';
import { ObjectList, ShapesPanel } from './ShapesPanel.tsx';
import { TopBar } from './TopBar.tsx';
import { useAutosave } from './useAutosave.ts';
import { useLibrary } from './useLibrary.ts';
import { useMeshes } from './useMeshes.ts';
import { ViewportCanvas } from './viewport/ViewportCanvas.tsx';

type Load = { kind: 'loading' } | { kind: 'ready'; design: Design } | { kind: 'missing' } | { kind: 'failed'; message: string };

/** Opens one saved design: loads it, then hands over to the editor. */
export function Editor({ id }: { id: string }) {
	const [load, setLoad] = useState<Load>({ kind: 'loading' });
	const [attempt, setAttempt] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is bumped by "Try again" to load the design afresh
	useEffect(() => {
		let cancelled = false;
		setLoad({ kind: 'loading' });
		getDesign(id).then(
			(design) => !cancelled && setLoad({ kind: 'ready', design }),
			(error: unknown) => {
				if (cancelled) return;
				if (error instanceof ApiError && error.status === 404) setLoad({ kind: 'missing' });
				else setLoad({ kind: 'failed', message: error instanceof Error ? error.message : 'Something went wrong' });
			},
		);
		return () => {
			cancelled = true;
		};
	}, [id, attempt]);

	if (load.kind === 'loading') return <main className="screen-message muted">Loading…</main>;
	if (load.kind === 'missing') return <NotFound heading="Design not found">It may have been deleted.</NotFound>;
	if (load.kind === 'failed') {
		return (
			<NotFound heading="This design could not be opened">
				{load.message}{' '}
				<button type="button" onClick={() => setAttempt((n) => n + 1)}>
					Try again
				</button>
			</NotFound>
		);
	}
	return <EditorView initial={load.design} />;
}

/** Shows the design's name in the browser tab while the editor is open. */
function useDocumentTitle(name: string): void {
	useEffect(() => {
		document.title = `${name} – Holecraft`;
		return () => {
			document.title = 'Holecraft';
		};
	}, [name]);
}

function EditorView({ initial }: { initial: Design }) {
	const [state, dispatch] = useReducer(editorReducer, initial, createEditorState);
	const design = state.history.present;
	const { meshes, add: addMesh } = useMeshes(design);
	const save = useAutosave(design, initial);
	useDocumentTitle(design.name);
	useEditorShortcuts(dispatch);

	// The Workplane tool's plane (not saved): new shapes stand on it instead of on the floor.
	const [plane, setPlane] = useState<WorkPlane | null>(null);
	const [sketchEdit, setSketchEdit] = useState<NodeId | null>(null);
	const addOnPlane = useCallback(
		(shape: ShapeType, onPlane: WorkPlane, point: Vec3) => dispatch({ type: 'addOnPlane', shape, plane: onPlane, point }),
		[],
	);
	// The shapes saved to the library (shared by every design): adding one opens it from the server first, then it is added like any shape.
	const library = useLibrary();
	const openSaved = library.open;
	const addSaved = useCallback(
		async (id: string, where: { at: [number, number] } | { plane: WorkPlane; point: Vec3 }) => {
			const shape = await openSaved(id);
			if (shape) dispatch({ type: 'addLibrary', shape, ...where });
		},
		[openSaved],
	);
	const addAt = useCallback((shape: ShapeType, at: [number, number]) => dispatch({ type: 'add', shape, at }), []);
	// A list row is a complete click: the press selects (shift toggles), and the release narrows a
	// multi-selection down to the clicked row, which the viewport only does when nothing was dragged.
	// With the Select toggle on, every row adds to (or takes from) the selection, as Shift does.
	const [multiSelect, setMultiSelect] = useState(false);
	const select = useCallback(
		(id: NodeId, additive: boolean) => {
			dispatch({ type: 'pick', id, additive: additive || multiSelect, phase: 'down' });
			dispatch({ type: 'pick', id, additive: additive || multiSelect, phase: 'click' });
		},
		[multiSelect],
	);

	const [width, depth] = design.grid.size;
	// Phones, folding phones and tablets: one panel tab at a time, and the selection's edits as buttons over the view.
	const compact = useCompactLayout();
	const [tab, setTab] = usePanelTab(state.selection.length);
	const shown = (t: PanelTab) => !compact || tab === t;

	return (
		<div className={compact ? 'app compact' : 'app'}>
			<TopBar
				compact={compact}
				state={state}
				dispatch={dispatch}
				meshes={meshes}
				save={save}
				onImported={(input, mesh) => {
					addMesh(input.ref, mesh);
					dispatch({ type: 'addMesh', input });
				}}
			/>

			<main className="workspace">
				<ViewportCanvas
					design={design}
					meshes={meshes}
					thumbnailReady={save.status === 'saved'}
					onThumbnail={(picture) => uploadThumbnail(design.id, picture)}
					selection={state.selection}
					onDropShape={addAt}
					onDropSaved={addSaved}
					plane={plane}
					onPlane={setPlane}
					onDropOnPlane={addOnPlane}
					onPick={(id, additive, phase) => dispatch({ type: 'pick', id, additive, phase })}
					onMoveStart={() => dispatch({ type: 'moveStart' })}
					onMove={(delta) => dispatch({ type: 'move', delta })}
					onMoveEnd={() => dispatch({ type: 'moveEnd' })}
					onMarquee={(ids, additive) => dispatch({ type: 'marquee', ids, additive })}
					onNudge={(delta) => dispatch({ type: 'nudge', delta })}
					onGeometry={(id, geometry) => dispatch({ type: 'setGeometry', id, geometry })}
					onRotation={(id, rotation) => dispatch({ type: 'setRotation', id, rotation })}
					onRemoveEdges={(id, ids) => dispatch({ type: 'removeEdges', id, ids })}
					multiSelect={multiSelect}
					onToggleMultiSelect={() => setMultiSelect((on) => !on)}
					onPreviewEdges={(id, edges) => dispatch({ type: 'previewEdges', id, edges })}
					onCancelDrag={() => dispatch({ type: 'cancelDrag' })}
					onPaint={(id, fill) => dispatch({ type: 'addPaint', id, fill })}
					onErasePaint={(ids) => dispatch({ type: 'clearPaint', ids })}
					onPaintStrokeStart={(id) => dispatch({ type: 'paintStart', id })}
					onPaintStrokePreview={(id, fill) => dispatch({ type: 'previewPaint', id, fill })}
					onPaintStrokeEnd={() => dispatch({ type: 'moveEnd' })}
					onPaintGapFill={(ids, fill) => dispatch({ type: 'addPaintAll', ids, fill })}
					sketchEdit={sketchEdit}
					onSketchEditChange={setSketchEdit}
					onFinishSketch={({ outlines, height, frame, editId }) =>
						dispatch(
							editId
								? { type: 'setSketch', id: editId, outlines, height }
								: { type: 'addSketch', plane: { origin: frame.origin, normal: frame.normal }, outlines, height },
						)
					}
					compact={compact}
					selectionBar={compact && <SelectionBar design={design} selection={state.selection} dispatch={dispatch} />}
				/>
				<aside className="panel">
					{compact && <PanelTabs tab={tab} onTab={setTab} selected={state.selection.length} />}
					{/* hidden rather than left out, so a tab keeps what was typed in it (a search, a name) */}
					<div className="panel-tab" hidden={!shown('shapes')}>
						<ShapesPanel
							onAddShape={(shape) => (plane ? addOnPlane(shape, plane, plane.origin) : addAt(shape, [0, 0]))}
							saved={{
								items: library.items,
								onAdd: (id) => void addSaved(id, plane ? { plane, point: plane.origin } : { at: [0, 0] }),
								onRename: (id, name) => void library.rename(id, name),
								onDelete: (id) => void library.remove(id),
							}}
						/>
					</div>
					<div className="panel-tab" hidden={!shown('edit')}>
						<PropertiesPanel
							design={design}
							selection={state.selection}
							dispatch={dispatch}
							library={library}
							onEditSketch={setSketchEdit}
						/>
						<ArrangePanel design={design} selection={state.selection} plane={plane} dispatch={dispatch} />
					</div>
					<div className="panel-tab" hidden={!shown('colours')}>
						<PalettePanel design={design} selection={state.selection} dispatch={dispatch} />
					</div>
					<div className="panel-tab" hidden={!shown('objects')}>
						<ObjectList design={design} selection={state.selection} onSelect={select} dispatch={dispatch} />
					</div>
				</aside>
			</main>

			<footer className="statusbar">
				<span>
					Workplane {width} × {depth} {design.units}
				</span>
				<span>
					Snap {design.grid.snap} {design.units}
				</span>
				<span>Objects: {design.roots.length}</span>
				{state.selection.length > 0 && <span>Selected: {state.selection.length}</span>}
			</footer>
		</div>
	);
}
