import type { Design, NodeId, ShapeNode } from './design.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';
import { multiplyMat4 } from './mat4.ts';
import { addShape, shapeBounds, translation } from './ops.ts';
import { composeTransform } from './rotation.ts';
import { normalizeSketch, type SketchOutline, type SketchPoint, sketchBox } from './sketch.ts';
import { isUsablePlane, planeFrame, planePoint, type WorkPlane } from './surfacePlane.ts';

/**
 * The Sketch shape: a drawing (outlines on a plane) extruded by its height. It keeps the drawing in \`node.sketch\`, centred on the shape's own
 * origin, and is as big as its box says (width and depth stretch the drawing, like the Text shape's letters). The shape stands on the plane it
 * was drawn on: its own x and y are the drawing's x and y, and its height goes out of the plane.
 */

const MIN_HEIGHT = 0.1;
const stamp = (now?: Date) => (now ?? new Date()).toISOString();
const validHeight = (h: number) => Number.isFinite(h) && h >= MIN_HEIGHT && h <= MAX_SHAPE_SIZE;

/**
 * Makes a Sketch shape from a drawing made on \`plane\` (outline points are plane coordinates: x along the plane's x, y along its y), \`height\`
 * mm thick going out of the plane. Lifted if that would put any of it below the floor. The same design and a null id for an underside, a
 * drawing with nothing in it (or too small or too big), or a height that is not a size.
 */
export function addSketchShape(
	design: Design,
	plane: WorkPlane,
	outlines: readonly SketchOutline[],
	height: number,
	opts: { id?: NodeId; now?: Date } = {},
): { design: Design; id: NodeId | null } {
	const drawing = isUsablePlane(plane.normal) && validHeight(height) ? normalizeSketch(outlines) : null;
	if (!drawing) return { design, id: null };
	const added = addShape(design, 'sketch', [0, 0], opts);
	const node = added.design.nodes[added.id];
	if (node?.kind !== 'shape') return { design, id: null };

	const point = planePoint(plane, drawing.centre[0], drawing.centre[1]);
	const placed: ShapeNode = {
		...node,
		transform: composeTransform(point, planeFrame(plane.normal)),
		params: { ...node.params, width: drawing.width, depth: drawing.depth, height },
		sketch: drawing.sketch,
	};
	const lowest = shapeBounds(placed).min[2];
	if (lowest < 0) placed.transform[14] = placed.transform[14]! - lowest;
	return { design: { ...added.design, nodes: { ...added.design.nodes, [added.id]: placed } }, id: added.id };
}

/** Whether the shape is shown mirrored in its own x (it was flipped), which a drawing needs since it is not the same seen left to right. */
const isFlipped = (node: Pick<ShapeNode, 'params'>) => node.params.mirror === 1;

/**
 * A sketch shape's outlines as they are now, in its own frame: stretched to its width and depth (it may have been resized since it was
 * drawn) and mirrored if it was flipped. This is what is drawn, built, exported and edited; the stored drawing is left as it was made.
 */
export function sketchShown(node: Pick<ShapeNode, 'params' | 'sketch'>): SketchOutline[] {
	if (!node.sketch) return [];
	const box = sketchBox(node.sketch);
	const sx = box.width > 0 ? Number(node.params.width) / box.width : 1;
	const sy = box.depth > 0 ? Number(node.params.depth) / box.depth : 1;
	const mirror = isFlipped(node) ? -1 : 1;
	return node.sketch.outlines.map((o) => ({ points: o.points.map(([x, y]): SketchPoint => [mirror * x * sx + 0, y * sy + 0]) }));
}

/**
 * Replaces a sketch shape's drawing with \`outlines\` (in the shape's own frame, as \`sketchShown\` gives them, so the drawing stays where it
 * is in the world), and its height if one is given. What the shape had been stretched to and flipped is now part of the drawing. The same
 * design for a locked shape, one that is not a sketch, a drawing with nothing in it, or when nothing changes.
 */
export function setShapeSketch(
	design: Design,
	id: NodeId,
	outlines: readonly SketchOutline[],
	opts: { height?: number; now?: Date } = {},
): Design {
	const node = design.nodes[id];
	if (node?.kind !== 'shape' || node.shapeType !== 'sketch' || node.locked) return design;
	const height = opts.height ?? Number(node.params.height);
	const drawing = validHeight(height) ? normalizeSketch(outlines) : null;
	if (!drawing) return design;

	const { mirror: _gone, ...rest } = node.params;
	const next: ShapeNode = {
		...node,
		transform: multiplyMat4(node.transform, translation(drawing.centre[0], drawing.centre[1], 0)).map((v) => v + 0),
		params: { ...rest, width: drawing.width, depth: drawing.depth, height },
		sketch: drawing.sketch,
	};
	const same =
		JSON.stringify(next.sketch) === JSON.stringify(node.sketch) &&
		JSON.stringify(next.params) === JSON.stringify(node.params) &&
		next.transform.every((v, i) => Math.abs(v - node.transform[i]!) < 1e-9);
	return same ? design : { ...design, nodes: { ...design.nodes, [id]: next }, updatedAt: stamp(opts.now) };
}
