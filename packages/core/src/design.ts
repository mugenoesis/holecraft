import type { Vec3 } from './camera.ts';
import type { GridSettings } from './grid.ts';
import { DEFAULT_GRID } from './grid.ts';
import { DEFAULT_PALETTE } from './palette.ts';
import type { Units } from './units.ts';

/** Bump when the on-disk design format changes, and add a migration. */
export const DESIGN_FORMAT_VERSION = 4;

/** What the designs list shows about each saved design. */
export interface DesignSummary {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	/** Top-level shapes and groups. */
	objectCount: number;
	/** When the design's thumbnail picture was last made (ms since 1970); absent if it has none. */
	thumbnailAt?: number;
}

/** Longest name the editor will give a design or a shape. */
export const MAX_NAME_LENGTH = 120;

export type NodeId = string;

/** Column-major 4x4 matrix, same layout as three.js `Matrix4.elements`. */
export type Mat4 = number[];

export const IDENTITY: Readonly<Mat4> = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export type SolidMode = 'solid' | 'hole';

export type EdgeTreatmentKind = 'chamfer' | 'round';

/**
 * A chamfer or round on one chosen edge of a solid (the Edge tool). The edge is stored as geometry in the node's own frame, never
 * as triangle numbers, so it survives moving, turning, saving and re-meshing. If an edit removes the edge, the treatment is skipped
 * (and reported) rather than cutting the wrong place.
 */
export interface EdgeTreatment {
	id: string;
	kind: EdgeTreatmentKind;
	/** mm: how far a chamfer cuts back along each face, or a round's radius. */
	size: number;
	/** The edge as a polyline (2 or more points; a closed loop repeats its first point). */
	points: Vec3[];
	/** Per segment, the outward directions (unit vectors) of the two faces that meet there. */
	normals: [Vec3, Vec3][];
}

/**
 * A fill of paint on a solid's surface (the Paint tool). Like an edge treatment it is geometry in the node's own frame, never triangle
 * numbers, so it survives moving, turning, saving and re-meshing: it is applied to whatever the surface looks like now, and a fill that
 * no longer touches the surface paints nothing. Fills apply in order, a later one over an earlier one.
 */
export type PaintFill =
	/**
	 * The connected piece of surface at `point`, whose outward direction there is `normal`. `color` null takes the paint off (erase). A smart
	 * fill (the default) spreads over neighbouring faces that turn no more than `angle` degrees (30 if absent); a bucket fill spreads over
	 * everything joined to it that is currently the same colour, whatever the angle.
	 */
	| { id: string; kind: 'region'; color: string | null; point: Vec3; normal: Vec3; spread?: 'smart' | 'bucket'; angle?: number }
	/** The whole surface (it also covers everything painted before). */
	| { id: string; kind: 'body'; color: string };

export interface BaseNode {
	id: NodeId;
	name: string;
	transform: Mat4;
	mode: SolidMode;
	color: string;
	hidden: boolean;
	locked: boolean;
	/** Chamfers and rounds on chosen edges, applied after the node is built (and, for a group, after its holes are cut). */
	edges?: EdgeTreatment[];
	/** Paint on the finished surface of a top-level node, in order (see PaintFill). */
	paint?: PaintFill[];
}

/** A parametric primitive (box, cylinder, text, ...) built by the geometry worker. */
export interface ShapeNode extends BaseNode {
	kind: 'shape';
	shapeType: string;
	params: Record<string, number | string | boolean>;
}

/** An imported mesh (STL, OBJ, 3MF); geometry lives in a separate blob. */
export interface MeshNode extends BaseNode {
	kind: 'mesh';
	meshRef: string;
}

/**
 * A group evaluates to union(solid children) minus union(hole children).
 * The boolean result is a derived cache and never stored, so ungrouping is lossless.
 */
export interface GroupNode extends BaseNode {
	kind: 'group';
	children: NodeId[];
	op: 'union' | 'intersect';
	multicolor: boolean;
}

export type DesignNode = ShapeNode | MeshNode | GroupNode;

export interface Design {
	formatVersion: number;
	id: string;
	name: string;
	units: Units;
	grid: GridSettings;
	/** The design's filament colours, 1 to 16 of them: slot 1 is the first. Used for multi-material printing. */
	palette: string[];
	nodes: Record<NodeId, DesignNode>;
	roots: NodeId[];
	createdAt: string;
	updatedAt: string;
}

export function createEmptyDesign(id: string, name = 'Untitled design', now = new Date()): Design {
	const timestamp = now.toISOString();
	return {
		formatVersion: DESIGN_FORMAT_VERSION,
		id,
		name,
		units: 'mm',
		grid: { ...DEFAULT_GRID, size: [...DEFAULT_GRID.size] },
		palette: [...DEFAULT_PALETTE],
		nodes: {},
		roots: [],
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}
