import {
	type Design,
	type EngraveSettings,
	engravePolygons,
	frameOfPlane,
	isUsablePlane,
	nodeBoundsIn,
	type SketchFrame,
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
	return { id: hit.id, frame, size: Math.max(60, diagonal * 1.6) };
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
