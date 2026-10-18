import type { Vec3 } from './camera.ts';
import type { Design, DesignNode, NodeId, SupportPoint, SupportPointType } from './design.ts';
import { newId } from './ids.ts';

/**
 * Support points for resin printing: the places where a printer's supports touch the model. The slicer (Trident) works them out, the user
 * moves, adds and removes them, and they are sent back with the model so the print is supported at exactly those points. They live in the
 * design (so they are saved and undone like anything else) in the world's own coordinates, the ones the exported file has.
 */

export const MAX_SUPPORT_POINTS = 5000;
export const MIN_SUPPORT_RADIUS = 0.1;
export const MAX_SUPPORT_RADIUS = 10;
/** The width of a point added by hand, and the slicer's usual one. */
export const DEFAULT_SUPPORT_RADIUS = 0.4;

/** What Trident sends and takes: per object (in the order the objects are sent), a list of points. */
export interface SupportPointsDocument {
	objects: { points: { x: number; y: number; z: number; radius: number; type: SupportPointType }[] }[];
}

const TYPES: readonly SupportPointType[] = ['manual', 'island', 'slope'];
const finite = (v: number) => Number.isFinite(v) && Math.abs(v) <= 1e5;
const clampRadius = (r: number) => Math.min(MAX_SUPPORT_RADIUS, Math.max(MIN_SUPPORT_RADIUS, r));

/** FNV-1a over the text: a short fingerprint, enough to notice that the shapes changed. */
function fingerprint(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return `${(h >>> 0).toString(16)}-${text.length}`;
}

/** JSON with the keys of every object in order, so the same data gives the same text however it was built (a loaded design lists keys differently). */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (typeof value === 'object' && value !== null) {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.filter((k) => record[k] !== undefined)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/** The part of a node that decides what it prints as: not its name, colour, lock or paint. */
function shapeOf(node: DesignNode): unknown {
	const { name: _name, color: _color, locked: _locked, paint: _paint, ...rest } = node;
	return rest;
}

/** A fingerprint of every shape in the design (where it is, how big, what it is made of), so points made for them can tell when they changed. */
export function supportsKey(design: Design): string {
	const nodes = Object.keys(design.nodes)
		.sort()
		.map((id) => [id, shapeOf(design.nodes[id]!)]);
	return fingerprint(canonical([design.roots, nodes]));
}

/** True when there are points and the shapes have changed since they were made (or last checked): they may no longer touch the model. */
export function supportsStale(design: Design): boolean {
	return !!design.supports && design.supports.key !== supportsKey(design);
}

function validPoint(p: { x: number; y: number; z: number; radius: number }): boolean {
	return finite(p.x) && finite(p.y) && finite(p.z) && Number.isFinite(p.radius) && p.radius > 0;
}

/**
 * Takes the points the slicer worked out as the design's points, replacing any it had, for the shapes as they are now. Refused (the same
 * design back) when a point is not a usable number, or there are more than `MAX_SUPPORT_POINTS`.
 */
export function setSupportPoints(design: Design, doc: SupportPointsDocument): Design {
	const points: SupportPoint[] = [];
	for (const [object, entry] of doc.objects.entries()) {
		for (const p of entry.points) {
			if (!validPoint(p) || !TYPES.includes(p.type) || points.length >= MAX_SUPPORT_POINTS) return design;
			points.push({ id: newId(), object, x: p.x, y: p.y, z: p.z, radius: clampRadius(p.radius), type: p.type });
		}
	}
	return { ...design, supports: { points, key: supportsKey(design) } };
}

/** A point of your own, on object number `object` of the export; the shapes are not checked again by adding it. */
export function addSupportPoint(
	design: Design,
	input: { object: number; x: number; y: number; z: number; radius: number },
	opts: { id?: string } = {},
): Design {
	const current = design.supports?.points ?? [];
	if (!validPoint(input) || current.length >= MAX_SUPPORT_POINTS || !Number.isInteger(input.object) || input.object < 0) return design;
	const point: SupportPoint = {
		id: opts.id ?? newId(),
		object: input.object,
		x: input.x,
		y: input.y,
		z: input.z,
		radius: clampRadius(input.radius),
		type: 'manual',
	};
	return { ...design, supports: { points: [...current, point], key: design.supports?.key ?? supportsKey(design) } };
}

function changePoint(design: Design, id: string, change: (p: SupportPoint) => SupportPoint): Design {
	const plan = design.supports;
	const index = plan ? plan.points.findIndex((p) => p.id === id) : -1;
	if (!plan || index < 0) return design;
	const before = plan.points[index]!;
	const after = change(before);
	if (after === before) return design;
	return { ...design, supports: { ...plan, points: plan.points.map((p, i) => (i === index ? after : p)) } };
}

export function moveSupportPoint(design: Design, id: string, to: Vec3): Design {
	const [x, y, z] = to;
	if (!finite(x) || !finite(y) || !finite(z)) return design;
	return changePoint(design, id, (p) => (p.x === x && p.y === y && p.z === z ? p : { ...p, x, y, z }));
}

/** Sets the width of a point's tip, kept between 0.1 and 10 mm. */
export function setSupportRadius(design: Design, id: string, radius: number): Design {
	if (!Number.isFinite(radius)) return design;
	const r = clampRadius(radius);
	return changePoint(design, id, (p) => (p.radius === r ? p : { ...p, radius: r }));
}

export function removeSupportPoint(design: Design, id: string): Design {
	const plan = design.supports;
	if (!plan?.points.some((p) => p.id === id)) return design;
	return { ...design, supports: { ...plan, points: plan.points.filter((p) => p.id !== id) } };
}

/** Takes every point away, and the record of them. */
export function clearSupportPoints(design: Design): Design {
	if (!design.supports) return design;
	const { supports: _supports, ...rest } = design;
	return rest;
}

/**
 * What to send Trident: the points of each of the `objects` objects of the file sent (an object with none gets none: no supports). Null when
 * the design has no points, so the slicer places them itself.
 */
export function supportPointsDocument(design: Design, objects: number): SupportPointsDocument | null {
	const plan = design.supports;
	if (!plan) return null;
	const doc: SupportPointsDocument = { objects: Array.from({ length: objects }, () => ({ points: [] })) };
	for (const p of plan.points) doc.objects[p.object]?.points.push({ x: p.x, y: p.y, z: p.z, radius: p.radius, type: p.type });
	return doc;
}

/**
 * Which object of an export a top-level node is: the exported ones are the visible solid top-level shapes and groups, in the design's order
 * (what `collectBodies` makes), so this is the number the slicer gives the node's points. Null for a node that is not exported.
 */
export function objectIndexOf(design: Design, id: NodeId): number | null {
	let index = 0;
	for (const root of design.roots) {
		const node = design.nodes[root];
		if (!node || node.hidden || node.mode !== 'solid' || node.kind === 'mesh') continue;
		if (root === id) return index;
		index++;
	}
	return null;
}

/** How many objects an export of the design has (see objectIndexOf): the number of lists of points to send. */
export function exportObjectCount(design: Design): number {
	return design.roots.filter((id) => {
		const node = design.nodes[id];
		return !!node && !node.hidden && node.mode === 'solid' && node.kind !== 'mesh';
	}).length;
}
