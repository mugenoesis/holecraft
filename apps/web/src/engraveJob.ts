import type { Bounds, MeshData, MeshShapeInput, NodeId } from '@holecraft/core';
import { type ConformFrame, type GroupMesh, writeStl } from '@holecraft/geometry';

/** Everything the engine needs to fit lettering to a shape: which shape, the plane the words were placed on and their rings in it, and how deep. */
export interface EngraveRequest {
	targetId: NodeId;
	frame: ConformFrame;
	polygons: [number, number][][];
	depth: number;
	mode: 'engrave' | 'raised';
	/** How finely the lettering is cut to follow the surface (mm). */
	resolution: number;
	/** The name the lettering's shape is given. */
	name: string;
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

export type EngraveOutcome =
	| { error: null; input: MeshShapeInput; bounds: Bounds; mesh: MeshData }
	| { error: string; input: null; bounds: null };

const failed = (error: unknown): EngraveOutcome => ({
	error: error instanceof Error ? error.message : 'The lettering could not be engraved',
	input: null,
	bounds: null,
});

/** The box a mesh fills. */
function boundsOf(mesh: GroupMesh): Bounds {
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
		const fitted = await deps.fit(request);
		const bytes = writeStl([{ name: request.name, color: '#8d99ae', mesh: fitted }]);
		const file = {
			name: 'engraving.stl',
			size: bytes.byteLength,
			arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
		};
		const { input, mesh } = await deps.read(file);
		return { error: null, input: { ...input, name: request.name.slice(0, 100) }, bounds: boundsOf(fitted), mesh };
	} catch (error) {
		return failed(error);
	}
}
