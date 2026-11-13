import { type MeshHealth, meshHealth } from '@holecraft/core';
import type { ExportBody } from './export.ts';

type Vec3 = [number, number, number];

/** What one exported body measures, worked out from its real triangles (not from the shapes it was made of). */
export interface BodyReport {
	name: string;
	color: string;
	/** Lowest and highest corner in the world (mm). */
	min: Vec3;
	max: Vec3;
	/** max - min, per axis. */
	size: Vec3;
	/** mm3. */
	volume: number;
	triangles: number;
	/** A closed surface facing outwards: what a slicer needs. */
	closed: boolean;
	/** Plain-words problems with the surface, empty when it is closed. */
	problems: string[];
}

const round = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Signed volume by summing the tetrahedra from the origin to each triangle (positive for an outward-facing closed surface). */
function volumeOf(positions: Float32Array, indices: Uint32Array): number {
	let sum = 0;
	for (let i = 0; i + 2 < indices.length; i += 3) {
		const [a, b, c] = [indices[i]! * 3, indices[i + 1]! * 3, indices[i + 2]! * 3];
		sum +=
			positions[a]! * (positions[b + 1]! * positions[c + 2]! - positions[b + 2]! * positions[c + 1]!) -
			positions[a + 1]! * (positions[b]! * positions[c + 2]! - positions[b + 2]! * positions[c]!) +
			positions[a + 2]! * (positions[b]! * positions[c + 1]! - positions[b + 1]! * positions[c]!);
	}
	return sum / 6;
}

function problemsOf(h: MeshHealth): string[] {
	const found: [number, string][] = [
		[h.openEdges, 'open edge(s): the surface has a hole in it'],
		[h.nonManifoldEdges, 'edge(s) shared by three or more triangles'],
		[h.flippedEdges, 'edge(s) where neighbouring triangles face opposite ways'],
		[h.degenerate, 'triangle(s) with no area'],
		[h.insideOut, 'triangle(s) of a piece that faces inwards'],
	];
	return found.filter(([count]) => count > 0).map(([count, text]) => `${count} ${text}`);
}

/** Measures every body an export would produce: size, volume and whether the surface is closed. Bounds and volume are rounded to 0.0001. */
export function measureBodies(bodies: readonly ExportBody[]): BodyReport[] {
	return bodies.map(({ name, color, mesh }) => {
		const min: Vec3 = [Infinity, Infinity, Infinity];
		const max: Vec3 = [-Infinity, -Infinity, -Infinity];
		for (let i = 0; i < mesh.positions.length; i++) {
			const axis = i % 3;
			min[axis] = Math.min(min[axis]!, mesh.positions[i]!);
			max[axis] = Math.max(max[axis]!, mesh.positions[i]!);
		}
		const health = meshHealth(mesh);
		const lo = min.map(round) as Vec3;
		const hi = max.map(round) as Vec3;
		return {
			name,
			color,
			min: lo,
			max: hi,
			size: hi.map((v, i) => round(v - lo[i]!)) as Vec3,
			volume: round(volumeOf(mesh.positions, mesh.indices)),
			triangles: health.triangles,
			closed: health.closed,
			problems: problemsOf(health),
		};
	});
}
