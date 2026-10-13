import type { Design, NodeId, ShapeNode } from './design.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';
import type { MeshData } from './meshShape.ts';
import { getShapeDef, isShapeType, type ParamDef } from './shapes.ts';
import { outwards } from './solidShapes.ts';

/**
 * Shapes built from their settings (the tube's wall, the torus's ring).
 *
 * A setting is kept in `params` as a **share** of the shape (see ParamDef), so the whole shape stretches evenly when it is resized:
 * a tube made twice as big has a wall twice as thick, its hole stays in proportion, and chamfers on it stretch exactly with it, so
 * nothing about it breaks once it is made. What was typed is kept and limited to what fits only when the shape is built, so shrinking
 * a shape and growing it back loses nothing. The Properties field shows and takes mm for the shape's current size.
 *
 * The same mesh is drawn in the view and given to the CSG engine, as for a chamfer.
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

/** What was typed for a setting (as a share), or its default if nothing usable was. */
function typedShare(node: ShapeNode, def: ParamDef): number {
	const typed = node.params[def.key];
	return typeof typed === 'number' && Number.isFinite(typed) ? typed : def.default;
}

/** A setting's value for a shape, as a share: what was typed (or the default), limited to what fits. NaN if the shape has no such setting. */
export function shapeParam(node: ShapeNode, key: string): number {
	const def = paramDef(node.shapeType, key);
	return def ? Math.max(def.min, Math.min(def.max, typedShare(node, def))) : Number.NaN;
}

/** A setting in mm for the shape as it is now: what the Properties field shows, limited to what fits. */
export function shapeParamMm(node: ShapeNode, key: string): number {
	const def = paramDef(node.shapeType, key);
	return def ? shapeParam(node, key) * def.mmPerUnit(sizeOf(node)) : Number.NaN;
}

/** What was typed for a setting in mm for the shape as it is now, before it is limited to what fits (to tell when it has been). */
export function typedParamMm(node: ShapeNode, key: string): number {
	const def = paramDef(node.shapeType, key);
	return def ? typedShare(node, def) * def.mmPerUnit(sizeOf(node)) : Number.NaN;
}

/**
 * Sets one of a shape's settings from a value in mm (for the shape as it is now), keeping it as a share of the shape. Refused (the same
 * design back) for a locked shape, a setting the shape does not have, or a number that is not above 0 and within the largest shape size.
 * Not limited to what fits here: see shapeParam.
 */
export function setShapeParam(design: Design, id: NodeId, key: string, mm: number, now?: Date): Design {
	const node = design.nodes[id];
	const def = node?.kind === 'shape' ? paramDef(node.shapeType, key) : null;
	if (node?.kind !== 'shape' || node.locked || !def) return design;
	if (!Number.isFinite(mm) || mm <= 0 || mm > MAX_SHAPE_SIZE) return design;
	const share = mm / def.mmPerUnit(sizeOf(node));
	if (!(share > 0) || node.params[key] === share) return design;
	const next: ShapeNode = { ...node, params: { ...node.params, [key]: share } };
	return { ...design, nodes: { ...design.nodes, [id]: next }, updatedAt: (now ?? new Date()).toISOString() };
}

function ellipse(a: number, b: number, z: number, positions: number[]): void {
	for (let i = 0; i < SEGMENTS; i++) {
		const t = (2 * Math.PI * i) / SEGMENTS;
		positions.push(a * Math.cos(t), b * Math.sin(t), z);
	}
}

/** A tube: an elliptical solid with a hole right through it, the outline shrunk by the wall's share of the radius (so a scaled copy of the outside). */
function tube(width: number, depth: number, height: number, wall: number): MeshData {
	const [a, b] = [width / 2, depth / 2];
	const [ia, ib] = [a * (1 - wall), b * (1 - wall)];
	const positions: number[] = [];
	// four rings: outer bottom, outer top, inner bottom, inner top
	for (const [ra, rb, z] of [
		[a, b, 0],
		[a, b, height],
		[ia, ib, 0],
		[ia, ib, height],
	] as const)
		ellipse(ra, rb, z, positions);
	const [ob, ot, ib0, it] = [0, SEGMENTS, 2 * SEGMENTS, 3 * SEGMENTS];
	const indices: number[] = [];
	for (let i = 0; i < SEGMENTS; i++) {
		const j = (i + 1) % SEGMENTS;
		indices.push(ob + i, ob + j, ot + i, ob + j, ot + j, ot + i); // the outside
		indices.push(ib0 + i, it + i, ib0 + j, ib0 + j, it + i, it + j); // the hole's wall, facing in
		indices.push(ot + i, ot + j, it + i, ot + j, it + j, it + i); // the top
		indices.push(ob + i, ib0 + i, ob + j, ob + j, ib0 + i, ib0 + j); // the bottom
	}
	return outwards(positions, indices);
}

/**
 * A torus: a ring with a round tube, stretched to the shape's width, depth and height. The tube's radius is `thickness` of the radius
 * of the whole, along x and along y (so an oval ring has an oval tube), and the shape's height vertically; it fills its box.
 */
function torus(width: number, depth: number, height: number, thickness: number): MeshData {
	const [rx, ry] = [(width / 2) * thickness, (depth / 2) * thickness];
	const [a, b] = [width / 2 - rx, depth / 2 - ry];
	const positions: number[] = [];
	for (let u = 0; u < SEGMENTS; u++) {
		const t = (2 * Math.PI * u) / SEGMENTS;
		for (let v = 0; v < RING_SEGMENTS; v++) {
			const s = (2 * Math.PI * v) / RING_SEGMENTS;
			positions.push((a + rx * Math.cos(s)) * Math.cos(t), (b + ry * Math.cos(s)) * Math.sin(t), height / 2 + (height / 2) * Math.sin(s));
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

/** The mesh of a shape built from its settings (base centre at the origin, standing on z = 0), or null for any other shape. */
export function parametricShape(node: ShapeNode): MeshData | null {
	const build = Object.hasOwn(BUILDERS, node.shapeType) ? BUILDERS[node.shapeType] : undefined;
	return build ? build(...sizeOf(node), node) : null;
}

/** Like parametricShape, from a type, size and settings (as shares), used by tests and anywhere there is no node. */
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
