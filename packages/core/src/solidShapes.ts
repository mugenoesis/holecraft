import { type MeshData, signedVolume } from './meshShape.ts';

/**
 * The basic solid shapes that are a stretched unit solid, like a box: a cone, pyramid, wedge, roof, half sphere, round roof and hexagon.
 * Each is one mesh in the unit box every shape is built in (x and y within ±0.5, z from 0 to 1), scaled by the shape's width,
 * depth and height. The same mesh is drawn in the view and given to the CSG engine, so what you see is what is cut and exported.
 *
 * All are the same seen in a mirror (left to right), so Flip stays exact for them. Facing: the wedge is tallest at the back (+y),
 * the roof's ridge and the round roof's arch run front to back (along y).
 */

/** Facets around a round shape (as for a cylinder), and the steps up a dome (as for a sphere, over a quarter turn). */
const SEGMENTS = 64;
const DOME_SEGMENTS = 48;
const DOME_STEPS = 16;
/** The arch of a round roof, in facets over half a turn. */
const ARCH_SEGMENTS = 32;

const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);

/** Turns every triangle round when the surface faces inwards, so the result always faces outwards. */
export function outwards(positions: number[], indices: number[]): MeshData {
	const mesh = { positions: new Float32Array(positions.map(clean)), indices: new Uint32Array(indices) };
	if (signedVolume(mesh) < 0) {
		for (let t = 0; t < mesh.indices.length; t += 3) {
			const b = mesh.indices[t + 1]!;
			mesh.indices[t + 1] = mesh.indices[t + 2]!;
			mesh.indices[t + 2] = b;
		}
	}
	return mesh;
}

/**
 * A solid of revolution about the z axis: rings of (radius, height) from the base up, with `segments` points each, starting at
 * `start` radians. A ring of radius 0 is a single point (the apex), and the base is closed with a fan.
 */
function revolve(rings: readonly (readonly [number, number])[], segments: number, start = 0): MeshData {
	const positions: number[] = [];
	const indices: number[] = [];
	const ids = rings.map(([r, z]) => {
		if (r === 0) {
			positions.push(0, 0, z);
			return [positions.length / 3 - 1];
		}
		return Array.from({ length: segments }, (_, i) => {
			const a = start + (2 * Math.PI * i) / segments;
			positions.push(r * Math.cos(a), r * Math.sin(a), z);
			return positions.length / 3 - 1;
		});
	});
	for (let k = 0; k + 1 < ids.length; k++) {
		const [lo, hi] = [ids[k]!, ids[k + 1]!];
		for (let i = 0; i < segments; i++) {
			const j = (i + 1) % segments;
			if (hi.length === 1) indices.push(lo[i]!, lo[j]!, hi[0]!);
			else indices.push(lo[i]!, lo[j]!, hi[i]!, lo[j]!, hi[j]!, hi[i]!);
		}
	}
	positions.push(0, 0, rings[0]![1]);
	const centre = positions.length / 3 - 1;
	for (let i = 0; i < segments; i++) indices.push(centre, ids[0]![(i + 1) % segments]!, ids[0]![i]!);
	return outwards(positions, indices);
}

/** A prism: a convex profile (corners in order) swept from t = -0.5 to t = 0.5, placed in 3D by `place`. */
function extrude(
	profile: readonly (readonly [number, number])[],
	place: (a: number, b: number, t: number) => [number, number, number],
): MeshData {
	const n = profile.length;
	const positions: number[] = [];
	for (const t of [-0.5, 0.5]) for (const [a, b] of profile) positions.push(...place(a, b, t));
	const indices: number[] = [];
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		indices.push(i, j, n + i, j, n + j, n + i);
	}
	for (let i = 1; i + 1 < n; i++) indices.push(0, i + 1, i, n, n + i, n + i + 1);
	return outwards(positions, indices);
}

const BUILDERS: Record<string, () => MeshData> = {
	cone: () =>
		revolve(
			[
				[0.5, 0],
				[0, 1],
			],
			SEGMENTS,
		),
	// four sides: the base corners are at (±0.5, ±0.5), a quarter turn apart and an eighth turn round from the x axis
	pyramid: () =>
		revolve(
			[
				[Math.SQRT1_2, 0],
				[0, 1],
			],
			4,
			Math.PI / 4,
		),
	'half-sphere': () =>
		revolve(
			Array.from({ length: DOME_STEPS + 1 }, (_, k) => {
				const a = (k / DOME_STEPS) * (Math.PI / 2);
				return [k === DOME_STEPS ? 0 : 0.5 * Math.cos(a), Math.sin(a)] as const;
			}),
			DOME_SEGMENTS,
		),
	// six corners: two at the middle of the left and right sides, four a quarter of the width in from the front and back corners
	hexagon: () =>
		extrude(
			[
				[0.5, 0],
				[0.25, 0.5],
				[-0.25, 0.5],
				[-0.5, 0],
				[-0.25, -0.5],
				[0.25, -0.5],
			],
			(x, y, t) => [x, y, t + 0.5],
		),
	wedge: () =>
		extrude(
			[
				[-0.5, 0],
				[0.5, 0],
				[0.5, 1],
			],
			(y, z, x) => [x, y, z],
		),
	roof: () =>
		extrude(
			[
				[-0.5, 0],
				[0.5, 0],
				[0, 1],
			],
			(x, z, y) => [x, y, z],
		),
	'round-roof': () =>
		extrude(
			Array.from({ length: ARCH_SEGMENTS + 1 }, (_, i) => {
				const a = (Math.PI * i) / ARCH_SEGMENTS;
				return [0.5 * Math.cos(a), Math.sin(a)] as const;
			}),
			(x, z, y) => [x, y, z],
		),
};

/** The shape types that have a mesh here (the others are built another way). */
export const SOLID_SHAPE_TYPES: readonly string[] = Object.keys(BUILDERS);

const cache = new Map<string, MeshData>();

/** The unit-box mesh of a basic solid shape, or null for a shape built another way (box, cylinder, sphere, imported). Shared: don't change it. */
export function unitSolidMesh(type: string): MeshData | null {
	const build = Object.hasOwn(BUILDERS, type) ? BUILDERS[type] : undefined;
	if (!build) return null;
	let mesh = cache.get(type);
	if (!mesh) {
		mesh = build();
		cache.set(type, mesh);
	}
	return mesh;
}
