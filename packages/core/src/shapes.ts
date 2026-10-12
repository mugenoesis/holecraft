export type ShapeType = 'box' | 'cylinder' | 'sphere' | 'cone' | 'pyramid' | 'wedge' | 'roof' | 'round-roof' | 'half-sphere';

export interface ShapeDef {
	id: ShapeType;
	name: string;
	/** Width (X), depth (Y), height (Z) in mm. */
	defaultSize: [number, number, number];
	color: string;
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
];

export function isShapeType(value: string): value is ShapeType {
	return SHAPE_DEFS.some((d) => d.id === value);
}

export function getShapeDef(type: ShapeType): ShapeDef {
	const def = SHAPE_DEFS.find((d) => d.id === type);
	if (!def) throw new Error(`Unknown shape type: ${type}`);
	return def;
}
