import {
	type Design,
	type EngraveSettings,
	engravePolygons,
	frameOfPlane,
	isUsablePlane,
	nodeBoundsIn,
	type SketchFrame,
	textMetrics,
	toFrame,
	whyNotEngrave,
} from '@holecraft/core';
import type { EngraveRequest } from '../engraveJob.ts';

/* The Engrave tool's rules, pure: what a click on a surface starts, and how the user's choices become a request to the geometry engine. */

/** What the bar starts with: the words "Text" at the size the Text shape starts at, cut a millimetre deep. */
export const DEFAULT_ENGRAVE: EngraveSettings = { text: 'Text', font: 1, em: 10, angle: 0, at: [0, 0], depth: 1, mode: 'engrave' };

/** The surface the pointer is on (what `pickSurface` gives): the shape it hit (none for the floor), the point and which way the face points. */
interface Hit {
	id?: string | undefined;
	point: readonly [number, number, number];
	normal: readonly [number, number, number];
}

/** A surface chosen to put lettering on: the shape, the plane the words are placed on, and how much of the view to frame. */
export interface EngraveStart {
	id: string;
	frame: SketchFrame;
	size: number;
	/** How far the shape reaches each way in the plane's x and y, from where the face was clicked: the room the words have. */
	reach: Reach;
	/** A letter size that fits the starting words on this shape (the usual size when there is room). */
	em: number;
}

export interface Reach {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

const round = (v: number) => Math.round(v * 100) / 100 + 0;

/** The plane to look at for a click, or the problem with it in words for the tool. */
export function engraveStart(design: Design, hit: Hit): EngraveStart | { problem: string } {
	if (!hit.id) return { problem: 'Click a face of a shape to put lettering on it (not the floor).' };
	const why = whyNotEngrave(design, hit.id);
	if (why) return { problem: why };
	if (!isUsablePlane([...hit.normal]))
		return { problem: 'That face points down, so the lettering could not be read: choose a side or the top.' };
	const origin: [number, number, number] = [round(hit.point[0]), round(hit.point[1]), round(hit.point[2])];
	const frame = frameOfPlane({ origin, normal: [...hit.normal] });
	const b = nodeBoundsIn(design, hit.id);
	const diagonal = b ? Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) : 0;
	const reach = b ? reachOf(b, frame) : { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
	return { id: hit.id, frame, size: Math.max(60, diagonal * 1.6), reach, em: fittingEm(reach.maxX - reach.minX) };
}

/** The box round a world box as the plane sees it (from its eight corners). */
function reachOf(b: { min: readonly number[]; max: readonly number[] }, frame: SketchFrame): Reach {
	const reach: Reach = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
	for (const x of [b.min[0]!, b.max[0]!]) {
		for (const y of [b.min[1]!, b.max[1]!]) {
			for (const z of [b.min[2]!, b.max[2]!]) {
				const [fx, fy] = toFrame(frame, [x, y, z]);
				reach.minX = Math.min(reach.minX, fx);
				reach.maxX = Math.max(reach.maxX, fx);
				reach.minY = Math.min(reach.minY, fy);
				reach.maxY = Math.max(reach.maxY, fy);
			}
		}
	}
	return reach;
}

/** The usual letter size, or smaller when the starting words would take more than 60% of the width the shape has (to the nearest half mm, at least 1). */
function fittingEm(width: number): number {
	const words = textMetrics(DEFAULT_ENGRAVE.text, DEFAULT_ENGRAVE.font)?.width ?? 2;
	const fits = Math.round(((0.6 * width) / words) * 2) / 2;
	return Number.isFinite(fits) ? Math.min(DEFAULT_ENGRAVE.em, Math.max(1, fits)) : DEFAULT_ENGRAVE.em;
}

/** Whether any of the words go past what the shape reaches in the plane, so they could not all be fitted to it. */
export function overhangs(polygons: readonly (readonly (readonly [number, number])[])[] | null, reach: Reach): boolean {
	const eps = 1e-6;
	return (polygons ?? []).some((ring) =>
		ring.some(([x, y]) => x < reach.minX - eps || x > reach.maxX + eps || y < reach.minY - eps || y > reach.maxY + eps),
	);
}

/** The request for the engine from the chosen surface and settings, or what is wrong with them in words. */
export function engraveRequest(start: EngraveStart, s: EngraveSettings): EngraveRequest | { problem: string } {
	if (!(Number.isFinite(s.depth) && s.depth > 0 && s.depth <= 1000))
		return { problem: 'The depth must be a number above 0, up to 1000 mm.' };
	if (!(Number.isFinite(s.em) && s.em > 0 && s.em <= 1000)) return { problem: 'The letter size must be a number above 0, up to 1000 mm.' };
	const polygons = engravePolygons(s);
	if (!polygons) return { problem: 'There are no letters to engrave: the words are empty, or only spaces.' };
	const words = s.text.length > 24 ? `${s.text.slice(0, 23)}…` : s.text;
	return {
		targetId: start.id,
		frame: start.frame,
		polygons,
		depth: s.depth,
		mode: s.mode,
		resolution: Math.min(1, Math.max(0.3, s.em / 20)),
		name: s.mode === 'engrave' ? `Engraving "${words}"` : `Raised "${words}"`,
	};
}
