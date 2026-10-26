import type { Bounds, EngraveSettings, Mat4, MeshData, MeshShapeInput, NodeId } from '@holecraft/core';
import { type ConformFrame, type GroupMesh, writeStl } from '@holecraft/geometry';

/** Everything the engine needs to fit lettering to a shape: which shape, the plane the words were placed on and their rings in it, and how deep. */
export interface EngraveRequest {
	targetId: NodeId;
	frame: ConformFrame;
	polygons: [number, number][][];
	/** The choices these were made from, which the engraving keeps so it can be edited. */
	settings: EngraveSettings;
	depth: number;
	mode: 'engrave' | 'raised';
	/** How finely the lettering is cut to follow the surface (mm). */
	resolution: number;
	/** The name the lettering's shape is given. */
	name: string;
	/** When the lettering goes into a group rather than the world: takes the fitted mesh from the world into the group's own frame. */
	into?: Mat4 | undefined;
}

/** The two things the job needs from outside: the engine, and the reader that stores an imported model. Passed in so the job is tested without either. */
interface Deps {
	fit: (request: EngraveRequest) => Promise<GroupMesh>;
	read: (file: {
		name: string;
		size: number;
		arrayBuffer: () => Promise<ArrayBuffer>;
	}) => Promise<{ input: MeshShapeInput; mesh: MeshData }>;
}

/** A mesh as the importer wants a file: a binary STL. */
export function stlFile(name: string, mesh: GroupMesh) {
	const bytes = writeStl([{ name, color: '#8d99ae', mesh }]);
	return {
		name: `${name}.stl`,
		size: bytes.byteLength,
		arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
	};
}

export type EngraveOutcome =
	| { error: null; input: MeshShapeInput; bounds: Bounds; mesh: MeshData }
	| { error: string; input: null; bounds: null };

const failed = (error: unknown): EngraveOutcome => ({
	error: error instanceof Error ? error.message : 'The lettering could not be engraved',
	input: null,
	bounds: null,
});

/** The mesh with every point taken through `m` (the mesh as it is when there is none). */
function moved(mesh: GroupMesh, m: Mat4 | undefined): GroupMesh {
	if (!m) return mesh;
	const positions = new Float32Array(mesh.positions.length);
	for (let i = 0; i < mesh.positions.length; i += 3) {
		const [x, y, z] = [mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!];
		positions[i] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
		positions[i + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
		positions[i + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
	}
	return { ...mesh, positions };
}

/** The box a mesh fills. */
export function boundsOf(mesh: GroupMesh): Bounds {
	const min: [number, number, number] = [Infinity, Infinity, Infinity];
	const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < mesh.positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k]!, mesh.positions[i + k]!);
			max[k] = Math.max(max[k]!, mesh.positions[i + k]!);
		}
	}
	return { min, max };
}

/**
 * Fits the lettering to the shape in the engine, reads the result back as an imported model (the same road Merge and Hollow take: an STL, then
 * the stored mesh), and gives it with its name and where it is in the world. A failure at either step is an outcome with words for the tool.
 */
export async function runEngrave(request: EngraveRequest, deps: Deps): Promise<EngraveOutcome> {
	try {
		const fitted = moved(await deps.fit(request), request.into);
		const { input, mesh } = await deps.read(stlFile('engraving', fitted));
		return { error: null, input: { ...input, name: request.name.slice(0, 100) }, bounds: boundsOf(fitted), mesh };
	} catch (error) {
		return failed(error);
	}
}
