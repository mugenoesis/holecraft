import type { Design, NodeId, ShapeNode } from './design.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';
import type { MeshData } from './meshShape.ts';
import { getShapeDef, isShapeType, type ParamDef } from './shapes.ts';
import { outwards } from './solidShapes.ts';

/**
 * Shapes built from their settings (the tube's wall, the torus's ring) at their real size, not stretched from a unit mesh: a 3 mm
 * wall stays 3 mm however the tube is resized. The same mesh is drawn in the view and given to the CSG engine, as for a chamfer.
 * Settings are kept in `params` in mm as typed and limited to what fits only when the shape is built, so shrinking a shape and
 * growing it back loses nothing.
 */

/** Facets round a tube or ring, and round a ring's own cross-section. */
const SEGMENTS = 64;
const RING_SEGMENTS = 24;

const sizeOf = (node: ShapeNode): [number, number, number] => [
	Number(node.params.width),
	Number(node.params.depth),
	Number(node.params.height),
];

/** The definition of a shape's setting, or null if the shape (or the setting) doesn't exist. */
function paramDef(shapeType: string, key: string): ParamDef | null {
	return (isShapeType(shapeType) ? getShapeDef(shapeType).params : undefined)?.find((p) => p.key === key) ?? null;
}

/** A setting's value for a shape: what was typed (or the default), limited to what fits the shape. */
export function shapeParam(node: ShapeNode, key: string): number {
	const def = paramDef(node.shapeType, key);
	if (!def) return Number.NaN;
	const typed = node.params[key];
	const value = typeof typed === 'number' && Number.isFinite(typed) ? typed : def.default;
	return Math.max(def.min, Math.min(def.limit(sizeOf(node)), value));
}

/**
 * Sets one of a shape's settings, in mm. Refused (the same design back) for a locked shape, a setting the shape does not have, or a
 * number that is not above 0 and within the largest shape size. Not limited to the shape's size here: see shapeParam.
 */
export function setShapeParam(design: Design, id: NodeId, key: string, value: number, now?: Date): Design {
	const node = design.nodes[id];
	if (node?.kind !== 'shape' || node.locked || !paramDef(node.shapeType, key)) return design;
	if (!Number.isFinite(value) || value <= 0 || value > MAX_SHAPE_SIZE || node.params[key] === value) return design;
	const next: ShapeNode = { ...node, params: { ...node.params, [key]: value } };
	return { ...design, nodes: { ...design.nodes, [id]: next }, updatedAt: (now ?? new Date()).toISOString() };
}

function ellipse(a: number, b: number, z: number, positions: number[]): void {
	for (let i = 0; i < SEGMENTS; i++) {
		const t = (2 * Math.PI * i) / SEGMENTS;
		positions.push(a * Math.cos(t), b * Math.sin(t), z);
	}
}

/** A tube: an elliptical solid with an elliptical hole right through, the wall the same thickness all round. */
function tube(width: number, depth: number, height: number, wall: number): MeshData {
	const [a, b] = [width / 2, depth / 2];
	const positions: number[] = [];
	// four rings: outer bottom, outer top, inner bottom, inner top
	for (const [ra, rb, z] of [
		[a, b, 0],
		[a, b, height],
		[a - wall, b - wall, 0],
		[a - wall, b - wall, height],
	] as const)
		ellipse(ra, rb, z, positions);
	const [ob, ot, ib, it] = [0, SEGMENTS, 2 * SEGMENTS, 3 * SEGMENTS];
	const indices: number[] = [];
	for (let i = 0; i < SEGMENTS; i++) {
		const j = (i + 1) % SEGMENTS;
		indices.push(ob + i, ob + j, ot + i, ob + j, ot + j, ot + i); // the outside
		indices.push(ib + i, it + i, ib + j, ib + j, it + i, it + j); // the hole's wall, facing in
		indices.push(ot + i, ot + j, it + i, ot + j, it + j, it + i); // the top
		indices.push(ob + i, ib + i, ob + j, ob + j, ib + i, ib + j); // the bottom
	}
	return outwards(positions, indices);
}

/**
 * A torus: a ring with a round (or, if the shape is tall or flat, oval) tube. The tube is `thickness` across horizontally and the
 * shape's height vertically; the ring runs round the middle so the whole fills the width and depth.
 */
function torus(width: number, depth: number, height: number, thickness: number): MeshData {
	const r = thickness / 2;
	const [a, b] = [width / 2 - r, depth / 2 - r];
	const positions: number[] = [];
	for (let u = 0; u < SEGMENTS; u++) {
		const t = (2 * Math.PI * u) / SEGMENTS;
		for (let v = 0; v < RING_SEGMENTS; v++) {
			const s = (2 * Math.PI * v) / RING_SEGMENTS;
			positions.push((a + r * Math.cos(s)) * Math.cos(t), (b + r * Math.cos(s)) * Math.sin(t), height / 2 + (height / 2) * Math.sin(s));
		}
	}
	const at = (u: number, v: number) => (u % SEGMENTS) * RING_SEGMENTS + (v % RING_SEGMENTS);
	const indices: number[] = [];
	for (let u = 0; u < SEGMENTS; u++) {
		for (let v = 0; v < RING_SEGMENTS; v++)
			indices.push(at(u, v), at(u + 1, v), at(u, v + 1), at(u + 1, v), at(u + 1, v + 1), at(u, v + 1));
	}
	return outwards(positions, indices);
}

const BUILDERS: Record<string, (w: number, d: number, h: number, node: ShapeNode) => MeshData> = {
	tube: (w, d, h, node) => tube(w, d, h, shapeParam(node, 'wall')),
	torus: (w, d, h, node) => torus(w, d, h, shapeParam(node, 'thickness')),
};

/** The shape types built from their settings. */
export const PARAMETRIC_TYPES: readonly string[] = Object.keys(BUILDERS);

/** The mesh of a shape built from its settings at its real size (base centre at the origin, standing on z = 0), or null for any other shape. */
export function parametricShape(node: ShapeNode): MeshData | null {
	const build = Object.hasOwn(BUILDERS, node.shapeType) ? BUILDERS[node.shapeType] : undefined;
	return build ? build(...sizeOf(node), node) : null;
}

/** Like parametricShape, from a type, size and settings (used by tests and anywhere there is no node). */
export function parametricMesh(
	type: string,
	width: number,
	depth: number,
	height: number,
	params: Record<string, number>,
): MeshData | null {
	const node = { shapeType: type, params: { width, depth, height, ...params } } as unknown as ShapeNode;
	return parametricShape(node);
}
