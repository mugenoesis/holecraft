import type { ShapeNode } from './design.ts';
import type { MeshData } from './meshShape.ts';
import { outwards } from './solidShapes.ts';
import { lengthOffset, threadKind, threadSettings } from './threadStandards.ts';

/**
 * The meshes of the threaded shapes: a rod, a hole's cutter, a bolt (thread and head) and a nut. All are built at their real size from
 * rings of 48 points round the axis, joined by bands, so the surfaces line up exactly and the threads of a bolt and a nut of the same
 * size mate (the nut's is the bolt's opened out by the fit, from the same starting height).
 */

/** Facets round a thread, and the steps of its helix: a row of the surface is one 48th of a pitch up, so the profile's corners fall on rows. */
const FACETS = 48;
/** An ISO thread's depth as a share of its pitch: 5/8 of the 60-degree sharp-V height (sqrt(3)/2 of the pitch). */
const THREAD_DEPTH = (5 / 8) * (Math.sqrt(3) / 2);
/** The profile in 48ths of a pitch, from the middle of a crest: flat crest (6), flank (15), flat root (12), flank (15). */
const CREST_HALF = 3;
const FLANK = 15;

/** How far out the surface is, 0 at the root and 1 at the crest, `phase` 48ths of a pitch from the middle of a crest (any real number). */
function profile(phase: number): number {
	const wrapped = ((phase % FACETS) + FACETS) % FACETS;
	const away = Math.min(wrapped, FACETS - wrapped);
	return Math.max(0, Math.min(1, 1 - (away - CREST_HALF) / FLANK));
}

type Point = readonly [number, number];
/** The ids of 48 points round the axis, anticlockwise from the +x axis. */
type Ring = readonly number[];

/** Collects points and triangles. A band joins two rings; which way it faces is the way round (see `band`). */
class Mesh {
	positions: number[] = [];
	indices: number[] = [];

	/** A ring of points at height z. */
	ring(points: readonly Point[], z: number): Ring {
		return points.map(([x, y]) => {
			this.positions.push(x, y, z);
			return this.positions.length / 3 - 1;
		});
	}

	point(x: number, y: number, z: number): number {
		this.positions.push(x, y, z);
		return this.positions.length / 3 - 1;
	}

	/**
	 * A strip of quads from ring `p` to ring `q`, facing the way tangent x (q - p) points (anticlockwise tangent): so p below q is a wall facing out,
	 * p above q a wall facing the axis, p inside q a face looking down and p outside q one looking up. `flip` takes the other diagonal, which is
	 * the one along a thread's helix when going down it.
	 */
	band(p: Ring, q: Ring, flip = false): void {
		for (let i = 0; i < FACETS; i++) {
			const j = (i + 1) % FACETS;
			if (flip) this.indices.push(p[i]!, p[j]!, q[i]!, p[j]!, q[j]!, q[i]!);
			else this.indices.push(p[i]!, p[j]!, q[j]!, p[i]!, q[j]!, q[i]!);
		}
	}

	/** A flat face filling a ring from `centre`, looking up or down. */
	fan(centre: number, ring: Ring, up: boolean): void {
		for (let i = 0; i < FACETS; i++) {
			const j = (i + 1) % FACETS;
			this.indices.push(...(up ? [centre, ring[i]!, ring[j]!] : [centre, ring[j]!, ring[i]!]));
		}
	}

	done(): MeshData {
		return outwards(this.positions, this.indices);
	}
}

const angleOf = (i: number) => (2 * Math.PI * i) / FACETS;

/** A circle of the given diameter, as 48 points. */
const circle = (diameter: number): Point[] =>
	Array.from({ length: FACETS }, (_, i) => [(diameter / 2) * Math.cos(angleOf(i)), (diameter / 2) * Math.sin(angleOf(i))]);

/**
 * A hexagon of the given width across its flats, as 48 points: its six corners (on the x axis and every 60 degrees) are among them and the
 * points between lie along its flats, so it is an exact hexagon.
 */
function hexagon(flats: number): Point[] {
	return Array.from({ length: FACETS }, (_, i) => {
		const a = angleOf(i);
		const fromFlat = (((((a * 180) / Math.PI) % 60) + 60) % 60) - 30; // degrees from the middle of the nearest flat
		const r = flats / 2 / Math.cos((fromFlat * Math.PI) / 180);
		return [r * Math.cos(a), r * Math.sin(a)] as const;
	});
}

/**
 * The rings of a right-handed thread from z = 0 to `length`: crest radius `crest`, groove depth `depth`, `pitch` a turn, the crest climbing
 * as it goes anticlockwise. A ring is a row of the surface a 48th of a pitch up (the last is wherever the length falls); a band between
 * neighbouring rings along the helix is exactly the profile.
 */
function threadRings(mesh: Mesh, length: number, crest: number, depth: number, pitch: number, simple: boolean): Ring[] {
	if (simple) {
		// a plain cylinder at the pitch diameter (d - 0.6495 p): the same length, nothing like the cost
		const round = circle(2 * (crest - PITCH_RADIUS_BELOW_CREST * pitch));
		return [mesh.ring(round, 0), mesh.ring(round, length)];
	}
	const step = pitch / FACETS;
	const rows = Math.ceil(length / step - 1e-9) + 1;
	return Array.from({ length: rows }, (_, j) => {
		const z = Math.min(j * step, length);
		return mesh.ring(
			Array.from({ length: FACETS }, (_, i) => {
				const r = crest - depth * (1 - profile(z / step - i));
				return [r * Math.cos(angleOf(i)), r * Math.sin(angleOf(i))] as const;
			}),
			z,
		);
	});
}

/** How far the pitch circle of an ISO thread is below its crest, in pitches: (d - d2) / 2 = 0.6495 p / 2. */
const PITCH_RADIUS_BELOW_CREST = 0.6495 / 2;

/** The thread's surface, a band from each ring to the next. */
const wrap = (mesh: Mesh, rings: readonly Ring[]) => {
	for (let j = 0; j + 1 < rings.length; j++) mesh.band(rings[j]!, rings[j + 1]!);
};

/** A rod: the thread, closed with a flat end at each end. */
function rod(length: number, crest: number, depth: number, pitch: number, simple: boolean): MeshData {
	const mesh = new Mesh();
	const rings = threadRings(mesh, length, crest, depth, pitch, simple);
	wrap(mesh, rings);
	mesh.fan(mesh.point(0, 0, 0), rings[0]!, false);
	mesh.fan(mesh.point(0, 0, length), rings[rings.length - 1]!, true);
	return mesh.done();
}

/** A bolt: the thread from z = 0 to `length`, and the head on top of it (a hex, or a round socket cap with a hex socket in its top). */
function bolt(node: ShapeNode, length: number): MeshData {
	const { size, head } = threadSettings(node.shapeType, node.params);
	const mesh = new Mesh();
	const rings = threadRings(mesh, length, size.diameter / 2, THREAD_DEPTH * size.pitch, size.pitch, isSimple(node));
	wrap(mesh, rings);
	mesh.fan(mesh.point(0, 0, 0), rings[0]!, false);
	const [under, top] = [length, length + lengthOffset(node.shapeType, node.params)];
	const [base, rim] = head === 1 ? [hexagon(size.flats), hexagon(size.flats)] : [circle(size.capDiameter), circle(size.capDiameter)];
	const [headBase, headTop] = [mesh.ring(base, under), mesh.ring(rim, top)];
	mesh.band(rings[rings.length - 1]!, headBase); // the head's underside, looking down
	mesh.band(headBase, headTop);
	if (head === 1) {
		mesh.fan(mesh.point(0, 0, top), headTop, true);
	} else {
		const [socketTop, socketFloor] = [
			mesh.ring(hexagon(size.socketFlats), top),
			mesh.ring(hexagon(size.socketFlats), top - size.socketDepth),
		];
		mesh.band(headTop, socketTop); // the top, looking up
		mesh.band(socketTop, socketFloor);
		mesh.fan(mesh.point(0, 0, top - size.socketDepth), socketFloor, true);
	}
	return mesh.done();
}

/** A nut: a hex prism with the thread (opened out by the fit) through it, starting at the same height as a bolt's so the two mate. */
function nut(node: ShapeNode, height: number): MeshData {
	const { size, clearance } = threadSettings(node.shapeType, node.params);
	const mesh = new Mesh();
	const rings = threadRings(mesh, height, size.diameter / 2 + clearance, THREAD_DEPTH * size.pitch, size.pitch, isSimple(node));
	for (let j = 0; j + 1 < rings.length; j++) mesh.band(rings[j + 1]!, rings[j]!, true); // the hole's wall, facing the axis
	const [low, high] = [mesh.ring(hexagon(size.flats), 0), mesh.ring(hexagon(size.flats), height)];
	mesh.band(low, high);
	mesh.band(rings[0]!, low);
	mesh.band(high, rings[rings.length - 1]!);
	return mesh.done();
}

/** Whether to draw the thread as a plain cylinder (see `withSimpleThreads`). */
const isSimple = (node: ShapeNode): boolean => node.params.simple === 1;

/** The mesh of a threaded shape at its real size, with its base centre at the origin and standing on z = 0. */
export function threadedMesh(node: ShapeNode): MeshData {
	const height = Number(node.params.height);
	const { size, clearance } = threadSettings(node.shapeType, node.params);
	const kind = threadKind(node.shapeType);
	if (kind === 'bolt') return bolt(node, height - lengthOffset(node.shapeType, node.params));
	if (kind === 'nut') return nut(node, height);
	return rod(height, size.diameter / 2 + clearance, THREAD_DEPTH * size.pitch, size.pitch, isSimple(node));
}
