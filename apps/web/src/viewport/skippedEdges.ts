import type { Design, NodeId } from '@holecraft/core';
import type { GroupResult } from '../geometry/GeometryService.ts';

/** An object whose chamfers or rounds could not all be applied, because an edit removed their edges. */
export interface SkippedEdgeNotice {
	id: NodeId;
	name: string;
	/** The treatments left out (still in the design, so they can be removed or the edit undone). */
	ids: string[];
}

/** What to tell the user about skipped edge treatments, from the latest computed results. */
export function skippedEdgeNotices(design: Design, results: ReadonlyMap<NodeId, GroupResult>): SkippedEdgeNotice[] {
	const notices: SkippedEdgeNotice[] = [];
	for (const [id, result] of results) {
		const node = design.nodes[id];
		const current = new Set(node?.edges?.map((t) => t.id));
		const ids = (result.mesh?.skippedEdges ?? []).filter((t) => current.has(t));
		if (node && ids.length) notices.push({ id, name: node.name, ids });
	}
	return notices;
}
