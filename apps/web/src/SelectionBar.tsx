import { canGroup, canUngroup, type Design, type NodeId } from '@holecraft/core';
import type { Dispatch } from 'react';
import type { EditorAction } from './editorState.ts';
import type { MergeUi } from './useMerge.ts';

interface Props {
	design: Design;
	selection: readonly NodeId[];
	dispatch: Dispatch<EditorAction>;
	/** Merging the selected shapes into one solid. */
	merge: MergeUi;
}

/**
 * The commonest edits for what is selected, as big buttons over the bottom of the view: on a touch screen these
 * stand in for Ctrl+D, H, Ctrl+G, Delete and Escape, so a finger never has to go to the panel for them.
 */
export function SelectionBar({ design, selection, dispatch, merge }: Props) {
	const nodes = selection.flatMap((id) => (design.nodes[id] ? [design.nodes[id]] : []));
	if (nodes.length === 0) return null;
	const allHoles = nodes.every((n) => n.mode === 'hole');

	const button = (label: string, icon: string, action: EditorAction, title: string) => (
		<button type="button" aria-label={label} title={title} onClick={() => dispatch(action)}>
			<span className="selection-bar-icon" aria-hidden="true">
				{icon}
			</span>
			<span className="selection-bar-label">{label}</span>
		</button>
	);

	return (
		<div className="selection-bar" role="toolbar" aria-label="Selection">
			{merge.error && (
				<p className="export-problem merge-problem" role="alert">
					{merge.error}
				</p>
			)}
			{button('Duplicate', '⧉', { type: 'duplicate' }, 'Duplicate (again repeats the last move)')}
			{allHoles
				? button('Make solid', '■', { type: 'setMode', mode: 'solid' }, 'Make it solid again')
				: button('Make hole', '□', { type: 'setMode', mode: 'hole' }, 'Make it a hole: it cuts what it overlaps once grouped')}
			{canGroup(design, selection) && button('Group', '⊞', { type: 'group' }, 'Group the selected shapes')}
			{canUngroup(design, selection) && button('Ungroup', '⊟', { type: 'ungroup' }, 'Split the group back into shapes')}
			{merge.why === null && (
				<button
					type="button"
					aria-label="Merge"
					title="Join the selected shapes into one solid"
					disabled={merge.busy}
					onClick={() => void merge.merge()}
				>
					<span className="selection-bar-icon" aria-hidden="true">
						⬓
					</span>
					<span className="selection-bar-label">{merge.busy ? 'Merging…' : 'Merge'}</span>
				</button>
			)}
			{button('Delete', '✕', { type: 'delete' }, 'Delete')}
			{button('Done', '✓', { type: 'clearSelection' }, 'Deselect')}
		</div>
	);
}
