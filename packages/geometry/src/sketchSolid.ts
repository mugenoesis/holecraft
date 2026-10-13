import { type ShapeNode, sketchShown } from '@holecraft/core';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';

/**
 * A Sketch shape's solid: its outlines (stretched to the shape's width and depth, and mirrored if it was flipped, as `sketchShown` gives
 * them) filled by the even-odd rule, so an outline inside another is a hole and one inside that is solid again, and extruded as thick as
 * the shape's height, standing on z = 0. A sketch with no drawing (a damaged file) builds nothing.
 */
export function sketchSolid(M: ManifoldToplevel, node: ShapeNode): Manifold {
	const polygons = sketchShown(node).map((outline) => outline.points);
	if (polygons.length === 0) return M.Manifold.compose([]); // nothing drawn
	const flat = M.CrossSection.ofPolygons(polygons, 'EvenOdd');
	try {
		return flat.extrude(Number(node.params.height));
	} finally {
		flat.delete();
	}
}
