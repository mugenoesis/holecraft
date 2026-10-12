import type { EdgeTreatment, Vec3 } from '@holecraft/core';

/**
 * The material an edge treatment removes, as plain geometry (no manifold here, so it is easy to test): for each straight
 * segment of the edge, a triangular prism along it (a chamfer), and for a round the cylinder to take back out of that prism.
 */

/** How far the cutting pieces reach past the faces (mm), so the cut never lands exactly on a face and leaves slivers. */
const PAD = 1e-3;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));

interface SegmentCut {
	/** Six corners of the prism to remove (its hull is the prism). */
	prism: Vec3[];
	/** For a round: the cylinder (axis from \`from\` to \`to\`, \`radius\`) to leave in place inside the prism. */
	keep?: { from: Vec3; to: Vec3; radius: number };
}

/** The pieces that cut one straight segment a-b where faces with outward normals n1, n2 meet. \`extend\` lengthens the cut past both ends. */
function segmentCut(a: Vec3, b: Vec3, n1: Vec3, n2: Vec3, kind: EdgeTreatment['kind'], size: number, extend: number): SegmentCut | null {
	const length = Math.hypot(...sub(b, a));
	if (!(length > 0)) return null;
	const t = unit(sub(b, a));
	// Into each face, away from the edge: perpendicular to the edge in that face, pointing away from the other face.
	const into = (n: Vec3, other: Vec3) => {
		const d = unit(cross(n, t));
		return dot(d, other) < 0 ? d : scale(d, -1);
	};
	const [d1, d2] = [into(n1, n2), into(n2, n1)];
	// The faces' inside angle: 90 degrees on a box, wider on a gentler edge. A round of radius r touches each face this far from the edge.
	const inside = Math.PI - Math.acos(Math.max(-1, Math.min(1, dot(n1, n2))));
	const back = kind === 'chamfer' ? size : size / Math.tan(inside / 2);

	// The two points where the cut meets the faces are pushed a hair further along the cut line itself, so the cut stays
	// exactly on the chamfer plane but pokes out past both faces; the tip on the edge is pushed outwards.
	const along = unit(sub(d1, d2));
	const corner = (p: Vec3): Vec3[] => {
		const tip = add(p, scale(add(n1, n2), PAD));
		return [tip, add(add(p, scale(d1, back)), scale(along, PAD)), add(add(p, scale(d2, back)), scale(along, -PAD))];
	};
	const start = sub(a, scale(t, extend));
	const end = add(b, scale(t, extend));
	const prism = [...corner(start), ...corner(end)];
	if (kind === 'chamfer') return { prism };
	// The round's centre: in from the touching point on face 1 by the radius.
	const centre = (p: Vec3) => sub(add(p, scale(d1, back)), scale(n1, size));
	return { prism, keep: { from: centre(sub(start, scale(t, PAD))), to: centre(add(end, scale(t, PAD))), radius: size } };
}

/** Every piece a treatment cuts: one per segment. A polyline's segments reach a little past their ends so neighbours overlap at the joints. */
export function treatmentCuts(treatment: EdgeTreatment): SegmentCut[] {
	const { points, normals, kind, size } = treatment;
	const extend = points.length > 2 ? size : PAD;
	const cuts: SegmentCut[] = [];
	for (let i = 0; i + 1 < points.length; i++) {
		const [n1, n2] = normals[i]!;
		const cut = segmentCut(points[i]!, points[i + 1]!, n1, n2, kind, size, extend);
		if (cut) cuts.push(cut);
	}
	return cuts;
}
