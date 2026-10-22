import type { Vec3 } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import type { GroupMesh } from './types.ts';

/*
 * Lettering fitted to a surface: the words are drawn flat on a plane (a frame: where it is and which way its x, y and normal go in the world),
 * and each point of them is moved along the normal onto the surface of the shape beneath, as a height field seen from the plane. An engraving is
 * the slab of lettering from the surface down to the depth (standing a little proud, so the cut is clean); raised lettering stands the depth out
 * of the surface (and a little way into it, so it joins). The depth is measured along the normal, so on a slope it is a little less into the
 * surface itself; on a part nearly edge-on to the view the letters stretch, as with any projection.
 */

export interface ConformFrame {
	origin: Vec3;
	u: Vec3;
	v: Vec3;
	normal: Vec3;
}

export interface ConformOptions {
	/** The lettering as closed rings in the frame's x and y (mm); rings wound the other way are holes of the letters. */
	polygons: readonly (readonly (readonly [number, number])[])[];
	/** How deep an engraving is cut, or how far raised lettering stands out (mm). */
	depth: number;
	mode: 'engrave' | 'raised';
	/** The longest an edge of the slab may be before it is cut to follow the surface (mm). */
	resolution?: number;
}

/** How far an engraving's slab stands above the surface, so the cut leaves no skin; and how far raised lettering goes into it, so it joins. */
const PROUD = 0.5;
const SUNK = 0.4;
const DEFAULT_RESOLUTION = 0.5;
/** A point this close to an edge of a triangle (in barycentric terms) counts as on it, so seams between triangles do not leave gaps. */
const EDGE = 1e-7;

/** Thrown when some of the lettering is not over the shape, so it cannot be fitted to it. */
export class OffSurfaceError extends Error {
	constructor(public readonly missed: number) {
		super('Part of the lettering is past the edge of the surface: make the letters smaller, or move them onto the surface');
		this.name = 'OffSurfaceError';
	}
}

const dot = (a: Vec3, p: readonly number[], o: Vec3) => a[0] * (p[0]! - o[0]) + a[1] * (p[1]! - o[1]) + a[2] * (p[2]! - o[2]);

/** The surface of a mesh as seen from a plane: how far along the plane's normal the highest part is above any point of the plane. */
class HeightField {
	private readonly triangles: number[] = [];
	private readonly cells: number[][];
	private readonly cols: number;
	private readonly rows: number;

	constructor(
		target: GroupMesh,
		frame: ConformFrame,
		private readonly box: { minX: number; minY: number; maxX: number; maxY: number },
	) {
		const count = target.positions.length / 3;
		const f = new Float64Array(count * 3);
		for (let i = 0; i < count; i++) {
			const p = [target.positions[i * 3]!, target.positions[i * 3 + 1]!, target.positions[i * 3 + 2]!];
			f[i * 3] = dot(frame.u, p, frame.origin);
			f[i * 3 + 1] = dot(frame.v, p, frame.origin);
			f[i * 3 + 2] = dot(frame.normal, p, frame.origin);
		}
		const kept: number[] = [];
		for (let t = 0; t < target.indices.length; t += 3) {
			const [a, b, c] = [target.indices[t]! * 3, target.indices[t + 1]! * 3, target.indices[t + 2]! * 3];
			const xs = [f[a]!, f[b]!, f[c]!];
			const ys = [f[a + 1]!, f[b + 1]!, f[c + 1]!];
			if (Math.max(...xs) < box.minX || Math.min(...xs) > box.maxX || Math.max(...ys) < box.minY || Math.min(...ys) > box.maxY) continue;
			const det = (xs[1]! - xs[0]!) * (ys[2]! - ys[0]!) - (xs[2]! - xs[0]!) * (ys[1]! - ys[0]!);
			if (Math.abs(det) < 1e-12) continue; // edge-on to the view: it covers nothing
			kept.push(a, b, c);
		}
		const side = Math.max(1, Math.min(96, Math.round(Math.sqrt(kept.length / 3 / 4))));
		this.cols = this.rows = side;
		this.cells = Array.from({ length: side * side }, () => []);
		for (let k = 0; k < kept.length; k += 3) {
			const offsets = [kept[k]!, kept[k + 1]!, kept[k + 2]!];
			const id = this.triangles.length / 9;
			for (const o of offsets) this.triangles.push(f[o]!, f[o + 1]!, f[o + 2]!);
			const xs = offsets.map((o) => f[o]!);
			const ys = offsets.map((o) => f[o + 1]!);
			const [c0, c1] = [this.col(Math.min(...xs)), this.col(Math.max(...xs))];
			const [r0, r1] = [this.row(Math.min(...ys)), this.row(Math.max(...ys))];
			for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c]!.push(id);
		}
	}

	private col(x: number): number {
		const w = this.box.maxX - this.box.minX || 1;
		return Math.max(0, Math.min(this.cols - 1, Math.floor(((x - this.box.minX) / w) * this.cols)));
	}

	private row(y: number): number {
		const h = this.box.maxY - this.box.minY || 1;
		return Math.max(0, Math.min(this.rows - 1, Math.floor(((y - this.box.minY) / h) * this.rows)));
	}

	/** The height of the surface above (x, y), or null where there is no surface (the point is outside the shape as seen from the plane). */
	at(x: number, y: number): number | null {
		const t = this.triangles;
		let best: number | null = null;
		for (const id of this.cells[this.row(y) * this.cols + this.col(x)]!) {
			const o = id * 9;
			const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = [
				t[o]!,
				t[o + 1]!,
				t[o + 2]!,
				t[o + 3]!,
				t[o + 4]!,
				t[o + 5]!,
				t[o + 6]!,
				t[o + 7]!,
				t[o + 8]!,
			];
			const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
			const w1 = ((x - x0) * (y2 - y0) - (x2 - x0) * (y - y0)) / det;
			const w2 = ((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0)) / det;
			const w0 = 1 - w1 - w2;
			if (w0 < -EDGE || w1 < -EDGE || w2 < -EDGE) continue;
			const z = w0 * z0 + w1 * z1 + w2 * z2;
			if (best === null || z > best) best = z;
		}
		return best;
	}
}

/**
 * The lettering fitted onto `target` (a mesh in the world) as a mesh in the world: an engraving to subtract from it, or raised lettering to join
 * to it. Throws `OffSurfaceError` when any of the lettering is not over the shape.
 */
export function conformToSurface(M: ManifoldToplevel, target: GroupMesh, frame: ConformFrame, options: ConformOptions): GroupMesh {
	const { polygons, depth, mode } = options;
	if (!(depth > 0 && depth <= 1000)) throw new Error('The depth must be a number above 0, up to 1000 mm');
	const [low, high] = mode === 'engrave' ? [-depth, PROUD] : [-SUNK, depth];

	let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const ring of polygons) {
		for (const [x, y] of ring) {
			[minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
		}
	}
	if (!Number.isFinite(minX)) throw new Error('There is no lettering to fit');
	const field = new HeightField(target, frame, { minX: minX - 1, minY: minY - 1, maxX: maxX + 1, maxY: maxY + 1 });

	const flat = M.CrossSection.ofPolygons(polygons as [number, number][][], 'NonZero');
	const made = [flat];
	try {
		const slab = flat.extrude(high - low);
		made.push(slab as never);
		const placed = slab.translate([0, 0, low]);
		made.push(placed as never);
		const fine = placed.refineToLength(options.resolution ?? DEFAULT_RESOLUTION);
		made.push(fine as never);
		let missed = 0;
		const fitted = fine.warp((vertex) => {
			const height = field.at(vertex[0], vertex[1]);
			if (height === null) missed++;
			else vertex[2] += height;
		});
		made.push(fitted as never);
		if (missed > 0) throw new OffSurfaceError(missed);
		return toWorld(fitted.getMesh(), frame);
	} finally {
		for (const m of made) (m as { delete: () => void }).delete();
	}
}

/** A manifold's mesh, with its points taken from the frame into the world. */
function toWorld(mesh: { vertProperties: Float32Array; numProp: number; triVerts: Uint32Array }, frame: ConformFrame): GroupMesh {
	const count = mesh.vertProperties.length / mesh.numProp;
	const positions = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		const [x, y, z] = [
			mesh.vertProperties[i * mesh.numProp]!,
			mesh.vertProperties[i * mesh.numProp + 1]!,
			mesh.vertProperties[i * mesh.numProp + 2]!,
		];
		for (let k = 0; k < 3; k++) positions[i * 3 + k] = frame.origin[k]! + frame.u[k]! * x + frame.v[k]! * y + frame.normal[k]! * z;
	}
	return { positions, indices: Uint32Array.from(mesh.triVerts) };
}
