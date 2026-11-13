import type { Design, NodeId, ShapeNode } from './design.ts';
import { createEmptyDesign } from './design.ts';
import { renameNode, setNodeColor, setNodeEuler, setNodeMode, setNodePosition, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { newId } from './ids.ts';
import { addShape } from './ops.ts';
import { setShapeParam, shapeParamMm } from './parametricShapes.ts';
import { getShapeDef, isShapeType, type ShapeType } from './shapes.ts';
import { setShapeText } from './textShape.ts';

/** Thrown when a part could not be made as asked. The message names the part and says why, so a model description can be corrected. */
export class ModelBuildError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ModelBuildError';
	}
}

/** One shape to put in a model. Everything is in millimetres, Z up, on the workplane. */
export interface PartSpec {
	type: ShapeType;
	/** Width (x), depth (y) and height (z) before any turn. The shape's usual size if left out. */
	size?: [number, number, number];
	/** Where the middle of the shape's base goes: x, y and the height above the workplane (0 if left out; it may be negative). Applied after `rotate`. */
	at?: [number, number, number?];
	/** Degrees about the world x, then y, then z axes, turning the shape about its own centre. */
	rotate?: [number, number, number];
	/** A hole cuts the solids it is grouped with. */
	hole?: boolean;
	/** `#rrggbb` */
	color?: string;
	name?: string;
	/** The shape's own settings: a tube's `wall`, a polygon's `sides`, ... in mm for the size given; plus `chamfer` / `chamferEdges`, `countersink` / `countersinkEnd` and `wrap`. */
	params?: Record<string, number | string>;
	/** The words of a text shape. */
	text?: string;
}

/** Settings that are not declared by a shape's definition but are kept in its params by other features (chamfers, countersinks, wrapped text). */
const EXTRA_PARAMS: Readonly<Record<string, 'number' | 'string'>> = {
	chamfer: 'number',
	chamferEdges: 'string',
	countersink: 'number',
	countersinkEnd: 'string',
	wrap: 'number',
};

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/**
 * Builds a design from a description in code: the same edits the editor makes, one after another, but loud about anything it refuses
 * (the editor's edits return the design untouched, which in a script would silently leave a part out). Nothing here is saved or sent.
 */
export class ModelBuilder {
	private current: Design;

	constructor(name: string, id: string = newId()) {
		this.current = createEmptyDesign(id, name);
	}

	get design(): Design {
		return this.current;
	}

	/** Adds a shape and returns its id. */
	add(spec: PartSpec): NodeId {
		if (!isShapeType(spec.type)) throw new ModelBuildError(`Unknown shape "${String(spec.type)}"`);
		if (spec.type === 'sketch')
			throw new ModelBuildError(
				'A sketch shape needs a drawing, which a model file cannot give it: build the outline from boxes, cylinders and holes instead',
			);
		const id = newId();
		const label = spec.name ?? getShapeDef(spec.type).name;
		this.current = addShape(this.current, spec.type, [0, 0], { id }).design;
		const fail = (why: string): never => {
			throw new ModelBuildError(`${label}: ${why}`);
		};

		// text first: new words change the shape's size to fit them
		if (spec.text !== undefined) this.applyText(id, spec.text, fail);
		if (spec.size) this.applySize(id, spec.size, fail);
		for (const [key, value] of Object.entries(spec.params ?? {})) this.setParam(id, key, value, fail);
		this.applyLook(id, spec, fail);
		if (spec.rotate) this.current = setNodeEuler(this.current, id, spec.rotate);
		this.applyPosition(id, spec.at ?? [0, 0, 0], fail);
		return id;
	}

	private node(id: NodeId): ShapeNode {
		return this.current.nodes[id] as ShapeNode;
	}

	private applyText(id: NodeId, text: string, fail: (why: string) => never): void {
		this.current = setShapeText(this.current, id, text);
		if (this.node(id).params.text !== text.slice(0, 100)) fail(`the words ${JSON.stringify(text)} have nothing the font can draw`);
	}

	private applySize(id: NodeId, size: readonly [number, number, number], fail: (why: string) => never): void {
		const [width, depth, height] = size;
		// the editor clamps or ignores a bad size and an unchanged one looks the same, so read the result back
		this.current = setShapeSize(this.current, id, { width, depth, height });
		const params = this.node(id).params;
		const got = [params.width, params.depth, params.height] as number[];
		if (got.some((v, i) => !(Math.abs(v - size[i]!) <= 1e-6))) {
			fail(
				`size ${size.join(' x ')} became ${got.join(' x ')} (each side must be 0.1 to 1000 mm, and a thread's width and depth come from its size)`,
			);
		}
	}

	private applyLook(id: NodeId, spec: PartSpec, fail: (why: string) => never): void {
		if (spec.hole) {
			const next = setNodeMode(this.current, [id], 'hole');
			if (next === this.current) fail('could not be made a hole');
			this.current = next;
		}
		if (spec.color !== undefined) {
			if (!HEX_COLOUR.test(spec.color)) fail(`colour ${JSON.stringify(spec.color)} is not #rrggbb`);
			this.current = setNodeColor(this.current, [id], spec.color.toLowerCase());
		}
		if (spec.name !== undefined) this.current = renameNode(this.current, id, spec.name);
	}

	private applyPosition(id: NodeId, at: readonly [number, number, number?], fail: (why: string) => never): void {
		const to: [number, number, number] = [at[0], at[1], at[2] ?? 0];
		this.current = setNodePosition(this.current, id, to);
		const placed = this.node(id).transform;
		const moved = placed[12] === to[0] && placed[13] === to[1] && placed[14] === to[2];
		if (!moved && (!to.every(Number.isFinite) || to[2] < -1000)) fail(`position ${to.join(', ')} was refused`);
	}

	private setParam(id: NodeId, key: string, value: number | string, fail: (why: string) => never): void {
		const node = this.current.nodes[id] as ShapeNode;
		// the builder only makes built-in shapes, never imported meshes
		const declared = getShapeDef(node.shapeType as ShapeType).params?.some((p) => p.key === key);
		if (declared) {
			if (typeof value !== 'number') fail(`setting "${key}" needs a number`);
			this.current = setShapeParam(this.current, id, key, value as number);
			// the editor limits a setting to what fits when it reads it back, so compare what it now says with what was asked
			const now = shapeParamMm(this.current.nodes[id] as ShapeNode, key);
			if (Math.abs(now - (value as number)) > 0.005)
				fail(`setting "${key}" was limited to ${Math.round(now * 1000) / 1000} mm (asked for ${value})`);
			return;
		}
		const kind = EXTRA_PARAMS[key];
		if (!kind) fail(`${node.shapeType} has no setting "${key}"`);
		if (typeof value !== kind) fail(`setting "${key}" needs a ${kind}`);
		if (typeof value === 'number' && !Number.isFinite(value)) fail(`setting "${key}" is not a number`);
		this.current = { ...this.current, nodes: { ...this.current.nodes, [id]: { ...node, params: { ...node.params, [key]: value } } } };
	}

	/** Joins top-level parts into a group, which cuts its holes out of its solids. Returns the group's id. */
	group(ids: readonly NodeId[], opts: { name?: string; hole?: boolean } = {}): NodeId {
		for (const id of ids) {
			if (!this.current.roots.includes(id))
				throw new ModelBuildError(`Cannot group "${id}": no such part, or it is already inside a group`);
		}
		const grouped = groupNodes(this.current, ids);
		if (grouped.id === null) throw new ModelBuildError('A group needs at least two parts');
		this.current = grouped.design;
		if (opts.name !== undefined) this.current = renameNode(this.current, grouped.id, opts.name);
		if (opts.hole) this.current = setNodeMode(this.current, [grouped.id], 'hole');
		return grouped.id;
	}
}
