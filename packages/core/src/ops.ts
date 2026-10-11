import type { Bounds, Vec3 } from './camera.ts';
import type { Design, DesignNode, Mat4, NodeId, ShapeNode } from './design.ts';
import { IDENTITY } from './design.ts';
import { newId } from './ids.ts';
import { multiplyMat4 } from './mat4.ts';
import { getShapeDef, type ShapeType } from './shapes.ts';

export function translation(x: number, y: number, z: number): Mat4 {
	return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

export function translationOf(m: Readonly<Mat4>): Vec3 {
	return [m[12]!, m[13]!, m[14]!];
}

export interface AddShapeOptions {
	/** Fixed id, for deterministic tests. */
	id?: NodeId;
	now?: Date;
}

/**
 * Returns a new design with a solid shape centred on `at` (workplane X/Y) and resting on
 * the workplane. Pure: the input design is left untouched.
 */
export function addShape(
	design: Design,
	type: ShapeType,
	at: [number, number],
	opts: AddShapeOptions = {},
): { design: Design; id: NodeId } {
	const def = getShapeDef(type);
	const id = opts.id ?? newId();
	const count = Object.values(design.nodes).filter((n) => n.kind === 'shape' && n.shapeType === type).length;
	const [width, depth, height] = def.defaultSize;

	const node: ShapeNode = {
		id,
		kind: 'shape',
		shapeType: type,
		name: `${def.name} ${count + 1}`,
		transform: translation(at[0], at[1], 0),
		mode: 'solid',
		color: def.color,
		hidden: false,
		locked: false,
		params: { width, depth, height },
	};

	return {
		id,
		design: {
			...design,
			nodes: { ...design.nodes, [id]: node },
			roots: [...design.roots, id],
			updatedAt: (opts.now ?? new Date()).toISOString(),
		},
	};
}

/**
 * Axis-aligned world bounds of a shape's box, however it is turned. `parent` is the transform of
 * the group it sits in, if any. Ignores visibility, so callers that care (see nodeBounds) must check.
 */
export function shapeBounds(node: ShapeNode, parent?: Readonly<Mat4>): Bounds {
	const { width, depth, height } = node.params as { width: number; depth: number; height: number };
	const m = parent ? multiplyMat4(parent, node.transform) : node.transform;
	const min: Vec3 = [Infinity, Infinity, Infinity];
	const max: Vec3 = [-Infinity, -Infinity, -Infinity];
	for (const x of [-width / 2, width / 2]) {
		for (const y of [-depth / 2, depth / 2]) {
			for (const z of [0, height]) {
				for (let k = 0; k < 3; k++) {
					// + 0 turns a -0 from the multiplications into 0.
					const v = m[k]! * x + m[4 + k]! * y + m[8 + k]! * z + m[12 + k]! + 0;
					min[k] = Math.min(min[k]!, v);
					max[k] = Math.max(max[k]!, v);
				}
			}
		}
	}
	return { min, max };
}

/** World bounds of a visible shape, or null for hidden nodes and anything that is not a shape. */
export function nodeBounds(node: DesignNode | undefined): Bounds | null {
	return node && !node.hidden && node.kind === 'shape' ? shapeBounds(node) : null;
}

const union = (a: Bounds, b: Bounds): Bounds => ({
	min: [0, 1, 2].map((k) => Math.min(a.min[k]!, b.min[k]!)) as Vec3,
	max: [0, 1, 2].map((k) => Math.max(a.max[k]!, b.max[k]!)) as Vec3,
});

function boundsWithin(design: Design, id: NodeId, parent: Readonly<Mat4>): Bounds | null {
	const node = design.nodes[id];
	if (!node || node.hidden) return null;
	if (node.kind === 'shape') return shapeBounds(node, parent);
	if (node.kind !== 'group') return null;

	const frame = multiplyMat4(parent, node.transform);
	const solids: Bounds[] = [];
	const holes: Bounds[] = [];
	for (const childId of node.children) {
		const child = design.nodes[childId];
		const b = boundsWithin(design, childId, frame);
		if (b) (child?.mode === 'hole' ? holes : solids).push(b);
	}
	// Holes never add material, so they don't size the group unless there is nothing else.
	const parts = solids.length ? solids : holes;
	return parts.length ? parts.reduce(union) : null;
}

/** World bounds of a top-level shape or group (looking inside groups), or null if hidden or empty. */
export function nodeBoundsIn(design: Design, id: NodeId): Bounds | null {
	return boundsWithin(design, id, IDENTITY);
}

/** Axis-aligned bounds of all visible top-level shapes, or null when there are none. */
export function designBounds(design: Design): Bounds | null {
	let bounds: Bounds | null = null;
	for (const id of design.roots) {
		const b = nodeBoundsIn(design, id);
		if (b) bounds = bounds ? union(bounds, b) : b;
	}
	return bounds;
}
