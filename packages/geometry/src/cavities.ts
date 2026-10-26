import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import type { GroupMesh } from './types.ts';

/** A cavity smaller than this (mm²) is not worth a warning: too little area to hold the film. A rule of thumb, as in Trident. */
export const CLOSED_CAVITY_MIN_AREA_MM2 = 25;

/** How far apart the layers looked at are (mm). A cavity is many millimetres tall, so this need not be the printer's layer height. */
const LAYER_MM = 0.5;

/** A margin (mm) around the shape, so the empty space outside it is one piece that touches the edge of the frame. */
const FRAME_MARGIN_MM = 1;

/** Below this area (mm²) two regions are only touching, not overlapping. */
const TOUCH_MM2 = 1e-4;

export interface ClosedCavity {
	/** The layer (from 0) and its height (mm) where the largest closed cavity begins. */
	layer: number;
	z: number;
	areaMm2: number;
}

const overlaps = (a: CrossSection, b: CrossSection) => a.intersect(b).area() > TOUCH_MM2;

/**
 * The largest cavity of a shape that no resin can flow into, as it is built layer by layer on the plane, or null when there is none.
 *
 * It is the same rule Trident uses on the sliced layers. A hole in a layer is closed when the layer before it had no open space there:
 * open space is empty space that reaches the edge, or a cavity that has a channel to such space. The model is taken to stand on
 * supports, clear of the plate, so below its first layer everything is open. A closed hole under the minimum area is not reported.
 */
export function findClosedCavity(M: ManifoldToplevel, mesh: GroupMesh): ClosedCavity | null {
	const { CrossSection, Manifold, Mesh } = M;
	const solid = new Manifold(new Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
	const box = solid.boundingBox();
	const top = box.max[2]!;
	const base = Math.max(0, box.min[2]!);
	const frame = CrossSection.square(
		[box.max[0]! - box.min[0]! + 2 * FRAME_MARGIN_MM, box.max[1]! - box.min[1]! + 2 * FRAME_MARGIN_MM],
		false,
	).translate([box.min[0]! - FRAME_MARGIN_MM, box.min[1]! - FRAME_MARGIN_MM]);

	let openBefore = frame;
	let worst: ClosedCavity | null = null;
	for (let layer = 0, z = base + LAYER_MM / 2; z < top; layer++, z += LAYER_MM) {
		const empty = frame.subtract(solid.slice(z));
		let closed = CrossSection.square([0, 0]);
		for (const piece of empty.decompose()) {
			if (piece.bounds().min[0] <= frame.bounds().min[0] + 1e-6) continue; // the outside, which touches the frame
			if (overlaps(piece, openBefore)) continue; // vented
			closed = closed.add(piece);
			const areaMm2 = piece.area();
			if (areaMm2 >= CLOSED_CAVITY_MIN_AREA_MM2 && areaMm2 > (worst?.areaMm2 ?? 0)) worst = { layer, z, areaMm2 };
		}
		openBefore = empty.subtract(closed);
	}
	return worst;
}
