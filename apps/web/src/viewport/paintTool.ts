import {
	type BrushDab,
	type BrushShape,
	canPaint,
	DEFAULT_FILL_ANGLE,
	type Design,
	type DesignNode,
	MAX_BRUSH_DABS,
	type NodeId,
	newId,
	type PaintFill,
	type Vec3,
} from '@holecraft/core';

/** What the Paint tool is set to: the colour to paint (null erases), the tool, a smart fill's angle in degrees, and the brush's shape and size (its diameter, mm). */
export interface PaintSettings {
	color: string | null;
	tool: 'smart' | 'bucket' | 'brush';
	angle: number;
	shape: BrushShape;
	size: number;
}

export const DEFAULT_PAINT_SETTINGS: PaintSettings = { color: null, tool: 'smart', angle: DEFAULT_FILL_ANGLE, shape: 'circle', size: 6 };

/** The brush sizes the slider offers (diameter, mm). */
export const BRUSH_SIZE = { min: 1, max: 60, step: 1 } as const;

/** Where a click landed: the top-level object it hit (none on the floor), the point (mm) and the way the surface faces there, in the world. */
export interface SurfaceClick {
	id?: NodeId;
	point: Vec3;
	normal: Vec3;
}

const round = (v: number) => Math.round(v * 1e4) / 1e4 + 0;

/** The object a click hit if it can be painted, or why it can't. */
function paintable(design: Design, hit: SurfaceClick): { id: NodeId; node: DesignNode } | { problem: string } {
	const node = hit.id ? design.nodes[hit.id] : undefined;
	if (!hit.id || !node || node.kind === 'mesh' || !design.roots.includes(hit.id)) return { problem: 'Click a shape to paint it' };
	if (node.locked) return { problem: `${node.name} is locked` };
	if (node.mode === 'hole') return { problem: 'A hole has no surface to paint' };
	if (!canPaint(design, hit.id)) return { problem: `${node.name} can't be painted` };
	return { id: hit.id, node };
}

/** A hit as a dab in the object's own frame (the transform is a rotation and a position, so going back is the rotation's transpose). */
function localDab(node: DesignNode, hit: SurfaceClick): BrushDab {
	const m = node.transform;
	const local = (v: Vec3, withPosition: boolean): Vec3 => {
		const d = [0, 1, 2].map((k) => v[k]! - (withPosition ? m[12 + k]! : 0));
		return [0, 1, 2].map((c) => round(m[c * 4]! * d[0]! + m[c * 4 + 1]! * d[1]! + m[c * 4 + 2]! * d[2]!)) as Vec3;
	};
	const normal = local(hit.normal, false);
	const length = Math.hypot(...normal);
	return { point: local(hit.point, true), normal: normal.map((v) => v / length) as Vec3 };
}

/** The fill for a brush stroke so far. */
function brushFill(id: string, settings: PaintSettings, dabs: BrushDab[]): PaintFill {
	return { id, kind: 'brush', color: settings.color, shape: settings.shape, radius: settings.size / 2, dabs };
}

/** The fill for a click, in the clicked object's own frame, or why it can't be painted. */
export function fillFor(design: Design, hit: SurfaceClick, settings: PaintSettings): { id: NodeId; fill: PaintFill } | { problem: string } {
	const target = paintable(design, hit);
	if ('problem' in target) return target;
	const dab = localDab(target.node, hit);
	if (settings.tool === 'brush') return { id: target.id, fill: brushFill(newId(), settings, [dab]) };
	const fill: PaintFill = {
		id: newId(),
		kind: 'region',
		color: settings.color,
		point: dab.point,
		normal: dab.normal,
		...(settings.tool === 'bucket' ? { spread: 'bucket' as const } : { angle: settings.angle }),
	};
	return { id: target.id, fill };
}

/** A brush stroke being dragged across one object: dabs are added as the pointer moves, a third of the radius apart. */
export class BrushStroke {
	private readonly dabs: BrushDab[];
	private readonly fillId = newId();

	constructor(
		readonly id: NodeId,
		private readonly node: DesignNode,
		private readonly settings: PaintSettings,
		first: BrushDab,
	) {
		this.dabs = [first];
	}

	/** Adds a dab where the pointer is now, if it is on this object and has moved far enough. True if the stroke changed. */
	add(hit: SurfaceClick): boolean {
		if (hit.id !== this.id || this.dabs.length >= MAX_BRUSH_DABS) return false;
		const dab = localDab(this.node, hit);
		const last = this.dabs[this.dabs.length - 1]!;
		const spacing = this.settings.shape === 'triangle' ? 0.5 : Math.max(this.settings.size / 6, 0.2);
		if (Math.hypot(...([0, 1, 2].map((k) => dab.point[k]! - last.point[k]!) as Vec3)) < spacing) return false;
		this.dabs.push(dab);
		return true;
	}

	/** The stroke so far, as one fill. */
	fill(): PaintFill {
		return brushFill(this.fillId, this.settings, [...this.dabs]);
	}
}

/** Starts a brush stroke at a click, or says why it can't. */
export function startStroke(design: Design, hit: SurfaceClick, settings: PaintSettings): BrushStroke | { problem: string } {
	const target = paintable(design, hit);
	return 'problem' in target ? target : new BrushStroke(target.id, target.node, settings, localDab(target.node, hit));
}

/** The filament (0-based) for a number key 1 to 9, if the palette has that many, as in OrcaSlicer; null for anything else. */
export function filamentForKey(key: string, paletteLength: number): number | null {
	if (!/^[1-9]$/.test(key)) return null;
	const index = Number(key) - 1;
	return index < paletteLength ? index : null;
}
