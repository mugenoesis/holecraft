export type ShapeType =
	| 'box'
	| 'cylinder'
	| 'sphere'
	| 'cone'
	| 'pyramid'
	| 'wedge'
	| 'roof'
	| 'round-roof'
	| 'half-sphere'
	| 'tube'
	| 'torus'
	| 'hexagon'
	| 'star';

/**
 * One setting a shape has besides its size (the Properties panel makes a field for each). It is kept as a share of the shape (0.3 is 30% of
 * the radius), so the whole shape, setting included, stretches evenly when it is resized and nothing about it breaks; the field shows and takes mm.
 */
export interface ParamDef {
	/** Where it is kept in the node's params. */
	key: string;
	label: string;
	/** The share it starts at. */
	default: number;
	/** The least share it may be. */
	min: number;
	/** The most share it may be: a wall can never fill the whole tube. */
	max: number;
	/** How many mm a share of 1 is for a shape of this width, depth and height: what the Properties field shows and takes. */
	mmPerUnit: (size: readonly [number, number, number]) => number;
}

export interface ShapeDef {
	id: ShapeType;
	name: string;
	/** Width (X), depth (Y), height (Z) in mm. */
	defaultSize: [number, number, number];
	color: string;
	/** Settings besides the size. A shape with some is built at its real size from them (see parametricMesh), not stretched from a unit mesh. */
	params?: readonly ParamDef[];
}

/**
 * Built-in shapes. Each is built into a unit-sized mesh whose base sits on z=0 and is
 * scaled by its width/depth/height params, so the document only stores sizes.
 */
export const SHAPE_DEFS: readonly ShapeDef[] = [
	{ id: 'box', name: 'Box', defaultSize: [20, 20, 20], color: '#f28c28' },
	{ id: 'cylinder', name: 'Cylinder', defaultSize: [20, 20, 20], color: '#2a9d8f' },
	{ id: 'sphere', name: 'Sphere', defaultSize: [20, 20, 20], color: '#e76f51' },
	{ id: 'cone', name: 'Cone', defaultSize: [20, 20, 20], color: '#8d99ae' },
	{ id: 'pyramid', name: 'Pyramid', defaultSize: [20, 20, 20], color: '#f28c28' },
	{ id: 'wedge', name: 'Wedge', defaultSize: [20, 20, 20], color: '#2a9d8f' },
	{ id: 'roof', name: 'Roof', defaultSize: [20, 20, 20], color: '#e76f51' },
	{ id: 'round-roof', name: 'Round Roof', defaultSize: [20, 20, 20], color: '#8d99ae' },
	{ id: 'half-sphere', name: 'Half Sphere', defaultSize: [20, 20, 20], color: '#f28c28' },
	{
		id: 'tube',
		name: 'Tube',
		defaultSize: [20, 20, 20],
		color: '#2a9d8f',
		// the wall is a share of the narrower radius: 0.3 of 10 mm is the 3 mm a 20 mm tube starts with
		params: [{ key: 'wall', label: 'Wall thickness', default: 0.3, min: 0.02, max: 0.95, mmPerUnit: ([w, d]) => Math.min(w, d) / 2 }],
	},
	{
		id: 'torus',
		name: 'Torus',
		defaultSize: [30, 30, 10],
		color: '#e76f51',
		// the ring's tube is a share of the narrower side: a third of 30 mm is the 10 mm a 30 mm torus starts with (at most 0.45, so a hole is left)
		params: [{ key: 'thickness', label: 'Ring thickness', default: 1 / 3, min: 0.02, max: 0.45, mmPerUnit: ([w, d]) => Math.min(w, d) }],
	},
	{ id: 'hexagon', name: 'Hexagon', defaultSize: [20, 17.32, 20], color: '#8d99ae' },
	{
		id: 'star',
		name: 'Star',
		defaultSize: [20, 19.02, 10],
		color: '#f28c28',
		// the inner radius is a share of the half-width: 0.4 of 10 mm is the 4 mm a 20 mm wide star starts with
		params: [{ key: 'inner', label: 'Inner radius', default: 0.4, min: 0.1, max: 0.9, mmPerUnit: ([w]) => w / 2 }],
	},
];

export function isShapeType(value: string): value is ShapeType {
	return SHAPE_DEFS.some((d) => d.id === value);
}

export function getShapeDef(type: ShapeType): ShapeDef {
	const def = SHAPE_DEFS.find((d) => d.id === type);
	if (!def) throw new Error(`Unknown shape type: ${type}`);
	return def;
}
