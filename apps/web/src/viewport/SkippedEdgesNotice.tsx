import type { NodeId } from '@holecraft/core';
import type { SkippedEdgeNotice } from './skippedEdges.ts';

/**
 * Tells the user, plainly and visibly, when chamfers or rounds were left out because an edit removed their edges, and offers to
 * remove them (Undo also brings the edge back). Nothing when everything applied.
 */
export function SkippedEdgesNotice({ notices, onRemove }: { notices: SkippedEdgeNotice[]; onRemove: (id: NodeId, ids: string[]) => void }) {
	if (notices.length === 0) return null;
	return (
		<div className="skipped-edges" role="status" data-testid="skipped-edges">
			{notices.map((n) => (
				<p key={n.id}>
					<span>
						{n.ids.length === 1 ? 'A chamfer or round' : `${n.ids.length} chamfers or rounds`} on <strong>{n.name}</strong> could not be
						applied: an edit removed {n.ids.length === 1 ? 'its edge' : 'their edges'}. Undo brings {n.ids.length === 1 ? 'it' : 'them'}{' '}
						back.
					</span>
					<button type="button" onClick={() => onRemove(n.id, n.ids)}>
						Remove
					</button>
				</p>
			))}
		</div>
	);
}
