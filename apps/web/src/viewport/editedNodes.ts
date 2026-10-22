import type { Design, NodeId } from '@holecraft/core';
import type { SurfaceTool } from './surfaceTool.ts';

/** The shapes the tool in use is working on, which the view leaves out (the drawing or the lettering is on screen instead): the sketch being redrawn, or the engraving being edited. */
export function editedNodeIds(
	tool: SurfaceTool | null,
	sketchEdit: NodeId | null,
	engraveEdit: { group: NodeId; node: NodeId } | null,
): NodeId[] {
	if (tool === 'sketch' && sketchEdit) return [sketchEdit];
	if (tool === 'engrave' && engraveEdit) return [engraveEdit.node];
	return [];
}

/** The design with these nodes hidden (the same design when none of them is in it). */
export function withoutNodes(design: Design, ids: readonly NodeId[]): Design {
	const found = ids.flatMap((id) => (design.nodes[id] ? [design.nodes[id]] : []));
	if (found.length === 0) return design;
	return { ...design, nodes: { ...design.nodes, ...Object.fromEntries(found.map((n) => [n.id, { ...n, hidden: true }])) } };
}
