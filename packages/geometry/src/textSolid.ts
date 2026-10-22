import { fontOf, isMirrored, type ShapeNode, textOf, textOutlines, wrapOf, wrapPoint } from '@holecraft/core';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';

/**
 * A Text shape's solid: the outline of its words filled by winding (so the holes of letters stay open), stretched to fill the shape's width and
 * depth (the box is centred on its base centre, as for every shape), and extruded as thick as its height, standing on z = 0. Wrapped text
 * (`params.wrap`) is then bent round a cylinder: the solid is cut finely enough to follow the curve and every point moved by `wrapPoint`.
 */
export function textSolid(M: ManifoldToplevel, node: ShapeNode): Manifold {
	const { width, depth, height } = node.params as { width: number; depth: number; height: number };
	const outline = textOutlines(textOf(node), fontOf(node));
	if (!outline) throw new Error(`"${node.name}" has no letters that can be drawn`);
	const { min, max } = outline.box;
	const flat = M.CrossSection.ofPolygons(outline.polygons, 'NonZero');
	const centred = flat.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2]);
	const fitted = centred.scale([width / (max[0] - min[0]), depth / (max[1] - min[1])]);
	// a flipped text is the mirror image, so its letters read backwards (a turned copy would not)
	const shown = isMirrored(node) ? fitted.mirror([1, 0]) : fitted;
	try {
		const solid = shown.extrude(height);
		const wrap = wrapOf(node);
		return wrap === 0 ? solid : bent(solid, wrap);
	} finally {
		for (const section of new Set([flat, centred, fitted, shown])) section.delete();
	}
}

/** The longest an edge may be before the bend follows the curve with it (mm): a few degrees of the cylinder, but never coarse or absurdly fine. */
const bendLength = (radius: number) => Math.min(2, Math.max(0.3, Math.abs(radius) * 0.04));

/** `solid` bent round a cylinder of this radius (see `wrapPoint`); `solid` is freed. */
function bent(solid: Manifold, radius: number): Manifold {
	const fine = solid.refineToLength(bendLength(radius));
	try {
		return fine.warp((vertex) => {
			const [x, y, z] = wrapPoint(vertex, radius);
			vertex[0] = x;
			vertex[1] = y;
			vertex[2] = z;
		});
	} finally {
		solid.delete();
		fine.delete();
	}
}
