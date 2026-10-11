import type { ExportBody } from '../export.ts';
import { requireBodies, triangleCount } from './shared.ts';

const HEADER = 'Holecraft binary STL, units: mm';

/**
 * Binary STL: an 80-byte header, a triangle count, then 50 bytes per triangle (a unit normal, three
 * corners, and two spare bytes). All bodies go in one file. The header deliberately does not start
 * with "solid", which some programs take as a sign of the ASCII variant.
 */
export function writeStl(bodies: readonly ExportBody[]): Uint8Array {
	requireBodies(bodies);
	const total = triangleCount(bodies);
	const bytes = new Uint8Array(84 + total * 50);
	const view = new DataView(bytes.buffer);
	bytes.set(new TextEncoder().encode(HEADER));
	view.setUint32(80, total, true);

	let offset = 84;
	for (const { mesh } of bodies) {
		const p = mesh.positions;
		for (let t = 0; t < mesh.indices.length; t += 3) {
			const a = mesh.indices[t]! * 3;
			const b = mesh.indices[t + 1]! * 3;
			const c = mesh.indices[t + 2]! * 3;

			// The normal follows from the winding; a degenerate triangle gets a zero normal rather than NaN.
			const ux = p[b]! - p[a]!;
			const uy = p[b + 1]! - p[a + 1]!;
			const uz = p[b + 2]! - p[a + 2]!;
			const vx = p[c]! - p[a]!;
			const vy = p[c + 1]! - p[a + 1]!;
			const vz = p[c + 2]! - p[a + 2]!;
			let nx = uy * vz - uz * vy;
			let ny = uz * vx - ux * vz;
			let nz = ux * vy - uy * vx;
			const length = Math.hypot(nx, ny, nz);
			[nx, ny, nz] = length > 0 ? [nx / length, ny / length, nz / length] : [0, 0, 0];

			// "+ 0" turns a negative zero into a plain zero.
			view.setFloat32(offset, nx + 0, true);
			view.setFloat32(offset + 4, ny + 0, true);
			view.setFloat32(offset + 8, nz + 0, true);
			for (const [k, i] of [a, b, c].entries()) {
				view.setFloat32(offset + 12 + k * 12, p[i]!, true);
				view.setFloat32(offset + 16 + k * 12, p[i + 1]!, true);
				view.setFloat32(offset + 20 + k * 12, p[i + 2]!, true);
			}
			offset += 50;
		}
	}
	return bytes;
}
