import type { EdgeTreatment, Vec3 } from '@holecraft/core';

/**
 * The material an edge treatment removes, as plain geometry (no manifold here, so it is easy to test): for each straight
 * piece of the edge, a prism along it (a chamfer), and for a round the cylinder to take back out of that prism.
 *
 * An edge that curves (the rim of a round or oval hole) is cut smoothly. At every point of the edge one cross-section of the
 * cutting wedge is worked out from the faces' directions there, averaged over the two pieces that meet; each piece's prism is
 * the solid between its two end sections. Neighbouring prisms therefore share an end section exactly: no gap and no overlap,
 * however sharply the edge curves. (Cutting each piece as its own straight prism, reaching past its ends, left ragged steps and,
 * on a small hole, removed far too much.)
 *
 * Known approximation: a section is square to the bisector of the bend, so across a bend its width in the plane of the bend is off
 * by a factor of cos(half the turn): 0.1% on a 64-sided rim, up to about 5% at the sharpest bend an edge may have (35 degrees).
 */

/** How far the cutting pieces reach past the faces (mm), so the cut never lands exactly on a face and leaves slivers. */
const PAD = 1e-3;
/**
 * The round's tube is a faceted cylinder sitting a hair inside the true circle, which would leave hairline slivers along where it
 * meets the faces. A tube 0.13% wider has flats that just cover the true circle (64 facets: cos(pi/64) = 0.9988), so it meets them cleanly.
 */
const TUBE_GROWTH = 1.0013;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => scale(a, 1 / length(a));

interface SegmentCut {
	/** Six corners of the prism to remove (its hull is the prism). */
	prism: Vec3[];
	/** For a round: the cylinder (axis from `from` to `to`, `radius`) to leave in place inside the prism. */
	keep?: { from: Vec3; to: Vec3; radius: number };
}

/** The wedge's cross-section at one point of the edge: its three corners, and where the round's circle is centred. */
interface Section {
	tip: Vec3;
	onFace1: Vec3;
	onFace2: Vec3;
	centre: Vec3;
	/** The direction the edge runs here. */
	tangent: Vec3;
}

/** The stored face pair of each piece, turned so the first face is the same face all along (the pairs come in either order). */
function alignedFaces(normals: readonly (readonly [Vec3, Vec3])[]): [Vec3, Vec3][] {
	const out: [Vec3, Vec3][] = [];
	for (const [first, second] of normals) {
		const previous = out[out.length - 1];
		const crossed = previous && dot(previous[0], second) + dot(previous[1], first) > dot(previous[0], first) + dot(previous[1], second);
		out.push(crossed ? [second, first] : [first, second]);
	}
	return out;
}

/** The section at point `p`, where the edge runs along `t` between faces with outward normals n1 and n2. */
function sectionAt(p: Vec3, t: Vec3, n1: Vec3, n2: Vec3, kind: EdgeTreatment['kind'], size: number): Section {
	// Into each face, away from the edge: perpendicular to the edge in that face, pointing away from the other face.
	const into = (n: Vec3, other: Vec3) => {
		const d = unit(cross(n, t));
		return dot(d, other) < 0 ? d : scale(d, -1);
	};
	const [d1, d2] = [into(n1, n2), into(n2, n1)];
	// The faces' inside angle: 90 degrees on a box, wider on a gentler edge. A round of radius r touches each face this far from the edge.
	const inside = Math.PI - Math.acos(Math.max(-1, Math.min(1, dot(n1, n2))));
	const back = kind === 'chamfer' ? size : size / Math.tan(inside / 2);
	// The two points where the cut meets the faces are pushed a hair further along the cut line itself, so the cut stays exactly on
	// the chamfer plane but pokes out past both faces; the tip on the edge is pushed outwards.
	const along = unit(sub(d1, d2));
	const onFace1 = add(add(p, scale(d1, back)), scale(along, PAD));
	const onFace2 = add(add(p, scale(d2, back)), scale(along, -PAD));
	const tip = add(p, scale(add(n1, n2), PAD));
	// The round's centre: in from the touching point on face 1 by the radius.
	const centre = sub(add(p, scale(d1, back)), scale(n1, size));
	return { tip, onFace1, onFace2, centre, tangent: t };
}

/** The mean of two unit directions, as a unit direction (the first if they cancel). */
const mean = (a: Vec3, b: Vec3): Vec3 => (length(add(a, b)) < 1e-9 ? a : unit(add(a, b)));

/** The sections along the whole edge: one per point, each from the faces and direction averaged over the pieces that meet there. */
function sections(
	points: readonly Vec3[],
	normals: readonly (readonly [Vec3, Vec3])[],
	kind: EdgeTreatment['kind'],
	size: number,
): Section[] {
	const faces = alignedFaces(normals);
	const n = points.length;
	const closed = n > 2 && length(sub(points[0]!, points[n - 1]!)) < 1e-9;
	const pieces = n - 1;
	const direction = (i: number) => unit(sub(points[i + 1]!, points[i]!));
	const out: Section[] = [];
	for (let i = 0; i < pieces; i++) {
		// the piece coming into this point, and the one going out of it (round a closed edge they wrap)
		const before = i > 0 ? i - 1 : closed ? pieces - 1 : null;
		const t = before === null ? direction(i) : mean(direction(before), direction(i));
		const [n1, n2] = before === null ? faces[i]! : [mean(faces[before]![0], faces[i]![0]), mean(faces[before]![1], faces[i]![1])];
		out.push(sectionAt(points[i]!, t, n1, n2, kind, size));
	}
	// the end point: where a closed edge started again, or the last piece's own end
	if (closed) out.push(out[0]!);
	else {
		const last = pieces - 1;
		out.push(sectionAt(points[n - 1]!, direction(last), faces[last]![0], faces[last]![1], kind, size));
	}
	return out;
}

/** How far a round's tube must reach past a joint so two straight tubes meeting at a bend leave no gap on the outside of it. */
const bendReach = (before: Vec3, after: Vec3, radius: number) =>
	radius * Math.tan(Math.acos(Math.max(-1, Math.min(1, dot(before, after)))) / 2);

/** The pieces of one treatment's edge, with what is needed to cut each: its sections, the edge's own ends and whether it is a closed loop. */
class EdgePieces {
	readonly all: Section[];
	readonly closed: boolean;

	constructor(private readonly treatment: EdgeTreatment) {
		this.all = sections(treatment.points, treatment.normals, treatment.kind, treatment.size);
		this.closed = this.all[this.all.length - 1] === this.all[0];
	}

	get count(): number {
		return this.treatment.points.length - 1;
	}

	/** The wedge of piece `i`: its two end sections. An end of the whole edge reaches a hair past it, like a straight edge's cut; elsewhere the next piece shares the section. */
	prism(i: number): Vec3[] {
		const [a, b] = [this.all[i]!, this.all[i + 1]!];
		const start = i === 0 && !this.closed ? scale(a.tangent, -PAD) : null;
		const end = i + 1 === this.count && !this.closed ? scale(b.tangent, PAD) : null;
		const corners = (s: Section, by: Vec3 | null): Vec3[] => [s.tip, s.onFace1, s.onFace2].map((v) => (by ? add(v, by) : v));
		return [...corners(a, start), ...corners(b, end)];
	}

	/** The piece before `i` (round a closed edge, the last one), if any. */
	before(i: number): number | null {
		return i > 0 ? i - 1 : this.closed ? this.count - 1 : null;
	}

	/** The piece after `i` (round a closed edge, the first one), if any. */
	after(i: number): number | null {
		return i + 1 < this.count ? i + 1 : this.closed ? 0 : null;
	}

	/** The direction piece `i`'s round tube runs, along the centres of its two sections. */
	axis(i: number): Vec3 {
		return unit(sub(this.all[i + 1]!.centre, this.all[i]!.centre));
	}

	/** The round's tube for piece `i`: along the centres, reaching past each bend just far enough to meet its neighbour's. */
	tube(i: number): NonNullable<SegmentCut['keep']> {
		const { size } = this.treatment;
		const axis = this.axis(i);
		const [previous, next] = [this.before(i), this.after(i)];
		const startReach = previous === null ? PAD : bendReach(this.axis(previous), axis, size) + PAD;
		const endReach = next === null ? PAD : bendReach(axis, this.axis(next), size) + PAD;
		return {
			from: sub(this.all[i]!.centre, scale(axis, startReach)),
			to: add(this.all[i + 1]!.centre, scale(axis, endReach)),
			radius: size * TUBE_GROWTH,
		};
	}
}

/** Every piece a treatment cuts: one per straight piece of the edge. */
export function treatmentCuts(treatment: EdgeTreatment): SegmentCut[] {
	if (treatment.points.length < 2) return [];
	const edge = new EdgePieces(treatment);
	const cuts: SegmentCut[] = [];
	for (let i = 0; i < edge.count; i++) {
		if (!(length(sub(treatment.points[i + 1]!, treatment.points[i]!)) > 0)) continue;
		cuts.push(treatment.kind === 'chamfer' ? { prism: edge.prism(i) } : { prism: edge.prism(i), keep: edge.tube(i) });
	}
	return cuts;
}
