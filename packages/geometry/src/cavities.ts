import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { GroupMesh } from './types.ts';

/** A cavity smaller than this (mm²) is not worth a warning: too little area to hold the film. A rule of thumb, as in Trident. */
const MIN_AREA_MM2 = 25;

/** How far apart the layers looked at are (mm). A cavity is many millimetres tall, so this need not be the printer's layer height. */
const LAYER_MM = 0.5;

/** A margin (mm) around the shape, so the empty space outside it is one piece that touches the edge of the frame. */
const FRAME_MARGIN_MM = 1;

/** Below this area (mm²) two regions are only touching, not overlapping. */
const TOUCH_MM2 = 1e-4;

/** How far (mm) the envelope a cavity is filled within is widened, so the sloping walls are inside it. */
const FILL_OVERLAP_MM = 0.02;

export interface ClosedCavity {
	/** Its place in the list, largest first. */
	id: number;
	/** The layer (from 0) and its height (mm) where the cavity is at its widest first. */
	layer: number;
	z: number;
	/** The largest area (mm²) it has in a layer. */
	areaMm2: number;
	/** A solid that fills it, in the shape's own coordinates. */
	fill: GroupMesh;
}

interface Deletable {
	delete(): void;
}

/** A closed hole in one layer, and the cavity it belongs to (an index that may since have been joined to another). */
interface Piece {
	area: CrossSection;
	cavity: number;
	z0: number;
	layer: number;
}

/**
 * Every cavity of a shape that no resin can flow into, as it is built layer by layer on the plane, the largest first.
 *
 * It is the same rule Trident uses on the sliced layers. A hole in a layer is closed when the layer before it had no open space there:
 * open space is empty space that reaches the edge, or a cavity that has a channel to such space. The model is taken to stand on
 * supports, clear of the plate, so below its first layer everything is open. A closed hole in one layer and one in the layer before it
 * that overlap are the same cavity; one under the minimum area is not reported. Each comes with the solid that fills it.
 */
export function findClosedCavities(M: ManifoldToplevel, mesh: GroupMesh): ClosedCavity[] {
	const owned: Deletable[] = [];
	const own = <T extends Deletable>(thing: T): T => {
		owned.push(thing);
		return thing;
	};
	try {
		const solid = own(new M.Manifold(new M.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices })));
		return cavitiesOf(M, solid, closedPieces(M, solid, own), own);
	} finally {
		for (const thing of owned) thing.delete();
	}
}

const overlaps = (a: CrossSection, b: CrossSection): boolean => {
	const both = a.intersect(b);
	const hit = both.area() > TOUCH_MM2;
	both.delete();
	return hit;
};

/** The closed holes of every layer, each tagged with the cavity it is part of (joined when a piece touches several). */
function closedPieces(M: ManifoldToplevel, solid: Manifold, own: <T extends Deletable>(thing: T) => T): Piece[] {
	const { CrossSection } = M;
	const box = solid.boundingBox();
	const base = Math.max(0, box.min[2]!);
	const frame = own(
		CrossSection.square(
			[box.max[0]! - box.min[0]! + 2 * FRAME_MARGIN_MM, box.max[1]! - box.min[1]! + 2 * FRAME_MARGIN_MM],
			false,
		).translate([box.min[0]! - FRAME_MARGIN_MM, box.min[1]! - FRAME_MARGIN_MM]),
	);
	const frameEdge = frame.bounds().min[0];

	const all: Piece[] = [];
	// union-find over cavity numbers: a piece that touches several earlier cavities joins them into one
	const joined: number[] = [];
	const root = (from: number): number => {
		let i = from;
		while (joined[i] !== i) i = joined[i]!;
		return i;
	};
	let openBefore = frame;
	let before: Piece[] = [];
	for (let layer = 0, z = base + LAYER_MM / 2; z < box.max[2]!; layer++, z += LAYER_MM) {
		const empty = own(frame.subtract(own(solid.slice(z))));
		const here: Piece[] = [];
		for (const area of empty.decompose().map(own)) {
			if (area.bounds().min[0] <= frameEdge + 1e-6) continue; // the outside, which touches the frame
			if (overlaps(area, openBefore)) continue; // open to the outside, directly or by a channel
			const touching = before.filter((p) => overlaps(p.area, area));
			const cavity = touching[0]?.cavity ?? joined.push(joined.length) - 1;
			for (const p of touching) joined[root(p.cavity)] = root(cavity);
			const piece = { area, cavity, z0: z - LAYER_MM / 2, layer };
			here.push(piece);
			all.push(piece);
		}
		openBefore = here.reduce((open, p) => own(open.subtract(p.area)), empty);
		before = here;
	}
	for (const p of all) p.cavity = root(p.cavity);
	return all;
}

/**
 * The pieces gathered by cavity, as cavities big enough to report, largest first.
 *
 * The layers only say *which* empty space is the cavity; the fill is that space itself, so nothing is left between the layers (a ridge or
 * a tip between two samples is wider than either). `reachOf` finds the cavity's whole connected void inside its height range, and where
 * that void also reaches the outside in that range (a channel, a side opening) only the part within an envelope of the cavity's pieces.
 */
function cavitiesOf(M: ManifoldToplevel, solid: Manifold, pieces: Piece[], own: <T extends Deletable>(thing: T) => T): ClosedCavity[] {
	const byCavity = new Map<number, Piece[]>();
	for (const p of pieces) byCavity.set(p.cavity, [...(byCavity.get(p.cavity) ?? []), p]);
	const found: Omit<ClosedCavity, 'id'>[] = [];
	for (const group of byCavity.values()) {
		const widest = group.reduce((best, p) => (p.area.area() > best.area.area() ? p : best));
		const areaMm2 = widest.area.area();
		if (areaMm2 < MIN_AREA_MM2) continue;
		found.push({ layer: group[0]!.layer, z: group[0]!.z0 + LAYER_MM / 2, areaMm2, fill: meshOf(fillOf(M, solid, group, own)) });
	}
	return found.sort((a, b) => b.areaMm2 - a.areaMm2).map((c, id) => ({ id, ...c }));
}

/** The solid that fills one cavity (given as its pieces) to its wall. */
function fillOf(M: ManifoldToplevel, solid: Manifold, group: Piece[], own: <T extends Deletable>(thing: T) => T): Manifold {
	const box = solid.boundingBox();
	// the envelope: each piece widened to the pieces a layer either side, so a sloping wall is inside it
	const slabs = group.map((p) => {
		const near = group.filter((q) => Math.abs(q.layer - p.layer) <= 1).map((q) => q.area);
		const area = own(own(M.CrossSection.union(near)).offset(FILL_OVERLAP_MM, 'Square'));
		return own(own(area.extrude(LAYER_MM + 2 * FILL_OVERLAP_MM)).translate([0, 0, p.z0 - FILL_OVERLAP_MM]));
	});
	const envelope = own(M.Manifold.union(slabs));

	// the empty space of the shape across the cavity's height range, plus a layer either side for a tip between two samples, split
	// into the pieces that are not joined to each other
	const lo = Math.max(box.min[2]!, Math.min(...group.map((p) => p.z0)) - LAYER_MM);
	const hi = Math.min(box.max[2]!, Math.max(...group.map((p) => p.z0)) + 2 * LAYER_MM);
	const side = [box.max[0]! - box.min[0]! + 2 * FRAME_MARGIN_MM, box.max[1]! - box.min[1]! + 2 * FRAME_MARGIN_MM] as const;
	const range = own(
		own(M.Manifold.cube([side[0], side[1], hi - lo], false)).translate([box.min[0]! - FRAME_MARGIN_MM, box.min[1]! - FRAME_MARGIN_MM, lo]),
	);
	const space = own(range.subtract(solid));
	const parts: Manifold[] = [];
	for (const part of space.decompose().map(own)) {
		const shared = own(part.intersect(envelope));
		if (shared.volume() <= TOUCH_MM2) continue; // not this cavity's
		const bounds = part.boundingBox();
		const outside =
			bounds.min[0]! <= box.min[0]! - FRAME_MARGIN_MM + 1e-6 ||
			bounds.min[1]! <= box.min[1]! - FRAME_MARGIN_MM + 1e-6 ||
			bounds.max[0]! >= box.max[0]! + FRAME_MARGIN_MM - 1e-6 ||
			bounds.max[1]! >= box.max[1]! + FRAME_MARGIN_MM - 1e-6;
		// a part that reaches the outside is the air round the shape too, so it is kept to the cavity's own envelope
		parts.push(outside ? shared : part);
	}
	return own(M.Manifold.union(parts));
}

function meshOf(solid: Manifold): GroupMesh {
	const mesh = solid.getMesh();
	const positions = new Float32Array((mesh.vertProperties.length / mesh.numProp) * 3);
	for (let i = 0; i < positions.length / 3; i++) {
		for (let k = 0; k < 3; k++) positions[i * 3 + k] = mesh.vertProperties[i * mesh.numProp + k]!;
	}
	return { positions, indices: new Uint32Array(mesh.triVerts) };
}
