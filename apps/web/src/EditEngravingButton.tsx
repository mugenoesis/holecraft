import { type Design, engravingsIn, type NodeId } from '@holecraft/core';

/**
 * Edit engraving: for a group that holds engravings made by the Engrave tool, one button for each (named by its words when there is more than one).
 * It goes back into the tool with that engraving's own choices; off while the group is locked.
 */
export function EditEngravingButtons({
	design,
	id,
	onEdit,
}: {
	design: Design;
	id: NodeId;
	onEdit: (group: NodeId, node: NodeId) => void;
}) {
	const found = engravingsIn(design, id);
	const group = design.nodes[id];
	if (found.length === 0 || !group) return null;
	return (
		<div className="button-row">
			{found.map(({ id: node, record }) => (
				<button
					key={node}
					type="button"
					className="primary"
					disabled={group.locked}
					onClick={() => onEdit(id, node)}
					title={group.locked ? 'Unlock the group to edit its engraving' : 'Go back into the Engrave tool to change these words'}
				>
					{found.length === 1 ? 'Edit engraving' : `Edit engraving “${record.settings.text}”`}
				</button>
			))}
		</div>
	);
}
