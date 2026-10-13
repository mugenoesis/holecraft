import { fontOf, type ShapeNode, textOf, textOutlines } from '@holecraft/core';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';

/**
 * A Text shape's solid: the outline of its words filled by winding (so the holes of letters stay open), stretched to fill the shape's width and
 * depth (the box is centred on its base centre, as for every shape), and extruded as thick as its height, standing on z = 0.
 */
export function textSolid(M: ManifoldToplevel, node: ShapeNode): Manifold {
	const { width, depth, height } = node.params as { width: number; depth: number; height: number };
	const outline = textOutlines(textOf(node), fontOf(node));
	if (!outline) throw new Error(`"${node.name}" has no letters that can be drawn`);
	const { min, max } = outline.box;
	const flat = M.CrossSection.ofPolygons(outline.polygons, 'NonZero');
	const centred = flat.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2]);
	const fitted = centred.scale([width / (max[0] - min[0]), depth / (max[1] - min[1])]);
	try {
		return fitted.extrude(height);
	} finally {
		for (const section of [flat, centred, fitted]) section.delete();
	}
}
