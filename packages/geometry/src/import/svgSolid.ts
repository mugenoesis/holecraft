import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { parseSvg } from './svg.ts';
import type { RawMesh } from './weld.ts';

/**
 * An SVG's filled shapes extruded `depth` mm into a solid standing on z = 0: each shape is filled by its own rule (so even-odd and non-zero holes come
 * out as the drawing meant), and shapes that overlap are joined into one. Throws an error with a message fit to show.
 */
export function svgToMesh(M: ManifoldToplevel, text: string, depth: number): RawMesh {
	if (!(depth > 0) || !Number.isFinite(depth)) throw new Error('The depth of the extrusion must be above 0');
	const owned: { delete(): void }[] = [];
	const keep = <T extends { delete(): void }>(item: T): T => {
		owned.push(item);
		return item;
	};
	try {
		const shapes = parseSvg(text).map((outline) =>
			keep(M.CrossSection.ofPolygons(outline.polygons, outline.evenOdd ? 'EvenOdd' : 'NonZero')),
		);
		const flat = keep(M.CrossSection.union(shapes));
		const solid: Manifold = keep(flat.extrude(depth));
		if (solid.isEmpty()) throw new Error('This SVG has nothing in it that could be made into a solid');
		const mesh = solid.getMesh();
		const count = mesh.vertProperties.length / mesh.numProp;
		const positions = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] = mesh.vertProperties[i * mesh.numProp + k]!;
		return { positions, indices: new Uint32Array(mesh.triVerts) };
	} finally {
		for (const item of owned) item.delete();
	}
}
