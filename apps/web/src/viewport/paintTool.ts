import { canPaint, DEFAULT_FILL_ANGLE, type Design, type NodeId, newId, type PaintFill, type Vec3 } from '@holecraft/core';

/** What the Paint tool is set to: the colour to paint (null erases), how far the fill spreads, and a smart fill's angle in degrees. */
export interface PaintSettings {
	color: string | null;
	tool: 'smart' | 'bucket';
	angle: number;
}

export const DEFAULT_PAINT_SETTINGS: PaintSettings = { color: null, tool: 'smart', angle: DEFAULT_FILL_ANGLE };

/** Where a click landed: the top-level object it hit (none on the floor), the point (mm) and the way the surface faces there, in the world. */
export interface SurfaceClick {
	id?: NodeId;
	point: Vec3;
	normal: Vec3;
}

const round = (v: number) => Math.round(v * 1e4) / 1e4 + 0;

/**
 * The fill for a click, in the clicked object's own frame (the transform is a rotation and a position, so going back is the rotation's
 * transpose), or why it can't be painted.
 */
export function fillFor(design: Design, hit: SurfaceClick, settings: PaintSettings): { id: NodeId; fill: PaintFill } | { problem: string } {
	const node = hit.id ? design.nodes[hit.id] : undefined;
	if (!hit.id || !node || node.kind === 'mesh' || !design.roots.includes(hit.id)) return { problem: 'Click a shape to paint it' };
	if (node.locked) return { problem: `${node.name} is locked` };
	if (node.mode === 'hole') return { problem: 'A hole has no surface to paint' };
	if (!canPaint(design, hit.id)) return { problem: `${node.name} can't be painted` };

	const m = node.transform;
	const local = (v: Vec3, withPosition: boolean): Vec3 => {
		const d = [0, 1, 2].map((k) => v[k]! - (withPosition ? m[12 + k]! : 0));
		return [0, 1, 2].map((c) => round(m[c * 4]! * d[0]! + m[c * 4 + 1]! * d[1]! + m[c * 4 + 2]! * d[2]!)) as Vec3;
	};
	const normal = local(hit.normal, false);
	const length = Math.hypot(...normal);
	const fill: PaintFill = {
		id: newId(),
		kind: 'region',
		color: settings.color,
		point: local(hit.point, true),
		normal: normal.map((v) => v / length) as Vec3,
		...(settings.tool === 'bucket' ? { spread: 'bucket' as const } : { angle: settings.angle }),
	};
	return { id: hit.id, fill };
}

/** The filament (0-based) for a number key 1 to 9, if the palette has that many, as in OrcaSlicer; null for anything else. */
export function filamentForKey(key: string, paletteLength: number): number | null {
	if (!/^[1-9]$/.test(key)) return null;
	const index = Number(key) - 1;
	return index < paletteLength ? index : null;
}
