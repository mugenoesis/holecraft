import { canGroup, canRedo, canUndo, canUngroup, type MeshData, type MeshShapeInput, type NodeId } from '@holecraft/core';
import type { Dispatch } from 'react';
import { ExportMenu } from './ExportMenu.tsx';
import type { EditorAction, EditorState } from './editorState.ts';
import { ImportButton } from './ImportButton.tsx';
import { Link } from './Link.tsx';
import { ServerStatus } from './ServerStatus.tsx';
import type { SaveStatus } from './saveController.ts';
import { useDraft } from './useDraft.ts';

const STATUS_LABEL: Record<SaveStatus, string> = {
	saved: 'Saved',
	dirty: 'Unsaved changes',
	saving: 'Saving…',
	error: 'Couldn’t save',
};

interface Props {
	state: EditorState;
	dispatch: Dispatch<EditorAction>;
	meshes: ReadonlyMap<string, MeshData>;
	onImported: (input: MeshShapeInput, mesh: MeshData) => void;
	save: { status: SaveStatus; problem: string | null; lastError: string | undefined };
	/** The compact layout: arrows for undo and redo, and group and ungroup left to the bar over the view. */
	compact: boolean;
	/** Opens the keyboard shortcut sheet. */
	onHelp: () => void;
}

/** The bar across the top of the editor: back link, undo/redo, group, name, import/export and save status. */
export function TopBar({ state, dispatch, meshes, onImported, save, compact, onHelp }: Props) {
	const design = state.history.present;
	const selection: readonly NodeId[] = state.selection;

	return (
		<header className="topbar">
			<Link to="/" className="back-link" title="Back to all your designs">
				← <span className="back-label">All designs</span>
			</Link>
			<div className="brand">
				<img src="/icon-192.png" alt="" width={24} height={24} />
				<span>Holecraft</span>
			</div>
			<div className="edit-actions" role="toolbar" aria-label="Edit">
				<button
					type="button"
					aria-label="Undo"
					onClick={() => dispatch({ type: 'undo' })}
					disabled={!canUndo(state.history)}
					title="Undo (Ctrl+Z)"
				>
					{compact ? '↶' : 'Undo'}
				</button>
				<button
					type="button"
					aria-label="Redo"
					onClick={() => dispatch({ type: 'redo' })}
					disabled={!canRedo(state.history)}
					title="Redo (Ctrl+Shift+Z)"
				>
					{compact ? '↷' : 'Redo'}
				</button>
			</div>
			<div className="edit-actions" role="toolbar" aria-label="Group" hidden={compact}>
				<button
					type="button"
					onClick={() => dispatch({ type: 'group' })}
					disabled={!canGroup(design, selection)}
					title="Group the selected shapes (Ctrl+G)"
				>
					Group
				</button>
				<button
					type="button"
					onClick={() => dispatch({ type: 'ungroup' })}
					disabled={!canUngroup(design, selection)}
					title="Split the selected group back into shapes (Ctrl+Shift+G)"
				>
					Ungroup
				</button>
			</div>
			<DesignNameField name={design.name} onCommit={(name) => dispatch({ type: 'renameDesign', name })} />
			<ImportButton onImported={onImported} />
			<ExportMenu design={design} selection={selection} meshes={meshes} />
			<span className={`save-status ${save.status}`} data-testid="save-status" aria-live="polite" title={save.lastError}>
				{STATUS_LABEL[save.status]}
				{save.status === 'error' && save.problem ? `: ${save.problem}` : ''}
			</span>
			<button type="button" className="help-button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={onHelp}>
				?
			</button>
			<ServerStatus />
		</header>
	);
}

/** The design's name, editable in place in the top bar. */
function DesignNameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
	const d = useDraft(name, onCommit);
	return (
		<input
			className="design-name-input"
			aria-label="Design name"
			type="text"
			maxLength={120}
			value={d.value}
			onChange={(e) => d.onChange(e.target.value)}
			onBlur={d.onBlur}
			onKeyDown={d.onKeyDown}
		/>
	);
}
