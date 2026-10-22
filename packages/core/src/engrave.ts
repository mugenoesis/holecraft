import type { Bounds } from './camera.ts';
import type { Design, GroupNode, NodeId, ShapeNode } from './design.ts';
import { type EngraveRecord, engraveParams, engraveRecordOf } from './engraveRecord.ts';
import { groupNodes } from './groups.ts';
import { addMeshShape, MESH_SHAPE_TYPE, type MeshShapeInput } from './meshShape.ts';
import { translation } from './ops.ts';
import { textOutlines } from './text.ts';

/*
 * Engraving and raising lettering on a surface. The Engrave tool looks straight at a chosen face and lets the words be placed and sized there;
 * the geometry engine then fits them onto the shape beneath them (the lettering becomes a mesh in the world). These are the pure rules around
 * that: where the letters go on the plane, which shapes can take lettering, and putting the fitted mesh in the design grouped with its target.
 */

/** What the user chooses in the tool. */
export interface EngraveSettings {
	text: string;
	font: number;
	/** The letters' size, in mm to the em (a 10 mm em has capitals about 7 mm high), as for the Text shape. */
	em: number;
	/** Turn of the words in degrees, anticlockwise as the view shows them. */
	angle: number;
	/** Where the middle of the words is on the plane (x and y in the frame). */
	at: [number, number];
	/** How deep an engraving goes, or how far raised lettering stands out (mm). */
	depth: number;
	mode: 'engrave' | 'raised';
}

/**
 * The words as closed rings in the plane's x and y (mm): centred on `at`, `em` mm to the em, turned by `angle`. A letter's hole is a ring wound the
 * other way, as the fonts have it. Null for words with no ink in the font, or a size that is not one.
 */
export function engravePolygons(s: Pick<EngraveSettings, 'text' | 'font' | 'em' | 'angle' | 'at'>): [number, number][][] | null {
	if (!(Number.isFinite(s.em) && s.em > 0 && s.em <= 1000) || !Number.isFinite(s.angle)) return null;
	const outline = textOutlines(s.text, s.font);
	if (!outline) return null;
	const [cx, cy] = [(outline.box.min[0] + outline.box.max[0]) / 2, (outline.box.min[1] + outline.box.max[1]) / 2];
	const [cos, sin] = [Math.cos((s.angle * Math.PI) / 180), Math.sin((s.angle * Math.PI) / 180)];
	return outline.polygons.map((ring) =>
		ring.map(([x, y]): [number, number] => {
			const [qx, qy] = [(x - cx) * s.em, (y - cy) * s.em];
			return [cos * qx - sin * qy + s.at[0], sin * qx + cos * qy + s.at[1]];
		}),
	);
}

/** Why this cannot be engraved, in words for the tool, or null when it can: a visible, unlocked solid shape or group at the top level. */
export function whyNotEngrave(design: Design, id: NodeId): string | null {
	const node = design.nodes[id];
	if (!node || node.kind === 'mesh') return 'That shape is no longer there.';
	if (!design.roots.includes(id)) return `${node.name} is inside a group: engrave the whole group, or ungroup it first.`;
	if (node.locked) return `${node.name} is locked: unlock it in the Objects list to engrave it.`;
	if (node.hidden) return `${node.name} is hidden: show it in the Objects list to engrave it.`;
	if (node.mode === 'hole') return `${node.name} is a hole: only a solid can be engraved.`;
	return null;
}

/**
 * Puts the fitted lettering (`input`, whose size is the box `bounds` it fills in the world) in the design, grouped with `targetId`: an engraving is
 * a hole, so the group has the words cut out of it; raised lettering is a solid in the target's colour, joined to it. The group is returned (it
 * becomes the selection). With a `record` (the choices and the plane), the engraving keeps it so it can be edited later (`reengrave`). The same design and a null id come back when the target cannot be engraved or the bounds are not numbers.
 */
export function engraveInto(
	design: Design,
	targetId: NodeId,
	input: MeshShapeInput,
	bounds: Bounds,
	mode: EngraveSettings['mode'],
	opts: { id?: NodeId; groupId?: NodeId; now?: Date; record?: EngraveRecord } = {},
): { design: Design; id: NodeId | null } {
	if (whyNotEngrave(design, targetId) !== null || ![...bounds.min, ...bounds.max].every(Number.isFinite)) return { design, id: null };
	const target = design.nodes[targetId]!;
	const added = addMeshShape(design, input, {
		at: [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2],
		...(opts.id ? { id: opts.id } : {}),
		...(opts.now ? { now: opts.now } : {}),
	});
	const shape = added.design.nodes[added.id] as ShapeNode;
	const placed: ShapeNode = {
		...shape,
		mode: mode === 'engrave' ? 'hole' : 'solid',
		color: mode === 'engrave' ? shape.color : target.color,
		transform: translation(shape.transform[12]!, shape.transform[13]!, bounds.min[2]),
		...(opts.record ? { params: { ...shape.params, ...engraveParams(opts.record) } } : {}),
	};
	const withNew: Design = { ...added.design, nodes: { ...added.design.nodes, [added.id]: placed } };
	const grouped = groupNodes(withNew, [targetId, added.id], {
		...(opts.groupId ? { id: opts.groupId } : {}),
		...(opts.now ? { now: opts.now } : {}),
	});
	return grouped.id === null ? { design, id: null } : grouped;
}

/** The group a node is directly inside, or null. */
function parentOf(design: Design, id: NodeId): GroupNode | null {
	for (const node of Object.values(design.nodes)) if (node.kind === 'group' && node.children.includes(id)) return node;
	return null;
}

/**
 * Swaps an engraving for lettering fitted again with new choices (`record`): the shape keeps its place in its group and takes the new mesh,
 * name, mode (a hole, or a solid in the colour of the group's other contents) and what it remembers. `bounds` is the new lettering's box in the
 * frame of the group the engraving is in, since that is the frame the shape is placed in. The same design comes back when the node is not an
 * engraving, its group is locked or hidden, or the bounds are not numbers.
 */
export function reengrave(design: Design, id: NodeId, input: MeshShapeInput, bounds: Bounds, record: EngraveRecord): Design {
	const node = design.nodes[id];
	const group = parentOf(design, id);
	if (node?.kind !== 'shape' || node.shapeType !== MESH_SHAPE_TYPE || !engraveRecordOf(node) || !group) return design;
	if (group.locked || group.hidden || ![...bounds.min, ...bounds.max].every(Number.isFinite)) return design;
	const [width, depth, height] = input.size;
	const engrave = record.settings.mode === 'engrave';
	const sibling = group.children.map((c) => design.nodes[c]).find((n) => n && n.id !== id && engraveRecordOf(n) === null);
	const replaced: ShapeNode = {
		...node,
		name: input.name,
		mode: engrave ? 'hole' : 'solid',
		color: engrave ? node.color : (sibling?.color ?? node.color),
		transform: translation((bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, bounds.min[2]),
		params: {
			...node.params,
			width,
			depth,
			height,
			originalWidth: width,
			originalDepth: depth,
			originalHeight: height,
			mesh: input.ref,
			...engraveParams(record),
		},
	};
	return { ...design, nodes: { ...design.nodes, [id]: replaced } };
}
