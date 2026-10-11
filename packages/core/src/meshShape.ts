import type { Design, NodeId, ShapeNode } from './design.ts';
import { MAX_SHAPE_SIZE } from './edit.ts';
import { newId } from './ids.ts';
import { translation } from './ops.ts';

/** The `shapeType` of an imported model: an ordinary shape whose geometry is a stored mesh. */
export const MESH_SHAPE_TYPE = 'mesh';

/** A triangle mesh: xyz positions and triangle corner indices. */
export interface MeshData {
	positions: Float32Array;
	indices: Uint32Array;
}

export const MAX_MESH_TRIANGLES = 1_000_000;
const MAX_MESH_VERTICES = 3_000_000;
/** Smallest side an imported model may have, in mm: anything thinner is effectively flat. */
const MIN_MODEL_SIZE = 0.01;

/** A stored mesh is named by the SHA-256 of its bytes: 64 lower-case hex digits. */
export function isMeshRef(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

const MAGIC = 0x314d4348; // "HCM1" read little-endian
const HEADER_BYTES = 12;

/** The bytes kept on the server for an imported model: a small header, then positions, then triangles. */
export function encodeMesh(mesh: MeshData): Uint8Array {
	const out = new Uint8Array(HEADER_BYTES + mesh.positions.byteLength + mesh.indices.byteLength);
	const view = new DataView(out.buffer);
	view.setUint32(0, MAGIC, true);
	view.setUint32(4, mesh.positions.length / 3, true);
	view.setUint32(8, mesh.indices.length / 3, true);
	out.set(new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength), HEADER_BYTES);
	out.set(new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength), HEADER_BYTES + mesh.positions.byteLength);
	return out;
}

/** Reads and checks stored mesh bytes. Throws if they are not exactly a valid mesh. */
export function decodeMesh(bytes: Uint8Array): MeshData {
	const bad = (why: string) => new Error(`Not a valid stored mesh: ${why}`);
	if (bytes.length < HEADER_BYTES) throw bad('too short');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== MAGIC) throw bad('wrong header');
	const vertices = view.getUint32(4, true);
	const triangles = view.getUint32(8, true);
	if (vertices > MAX_MESH_VERTICES || triangles > MAX_MESH_TRIANGLES) throw bad('too large');
	if (bytes.length !== HEADER_BYTES + vertices * 12 + triangles * 12) throw bad('wrong size');

	// Copy so the arrays are aligned, whatever offset the bytes came from.
	const positions = new Float32Array(vertices * 3);
	const indices = new Uint32Array(triangles * 3);
	for (let i = 0; i < positions.length; i++) {
		positions[i] = view.getFloat32(HEADER_BYTES + i * 4, true);
		if (!Number.isFinite(positions[i])) throw bad('contains a number that is not finite');
	}
	const at = HEADER_BYTES + vertices * 12;
	for (let i = 0; i < indices.length; i++) {
		indices[i] = view.getUint32(at + i * 4, true);
		if (indices[i]! >= vertices) throw bad('a triangle uses a corner that does not exist');
	}
	return { positions, indices };
}

/** Volume enclosed by the mesh in mm³: positive when the triangles face outwards. */
export function signedVolume(mesh: MeshData): number {
	const p = mesh.positions;
	let volume = 0;
	for (let t = 0; t < mesh.indices.length; t += 3) {
		const a = mesh.indices[t]! * 3;
		const b = mesh.indices[t + 1]! * 3;
		const c = mesh.indices[t + 2]! * 3;
		volume +=
			(p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
				p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
				p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
			6;
	}
	return volume;
}

/**
 * Fits a model into the unit box every shape is built in (x and y within ±0.5, z from 0 to 1), and
 * returns its real size in mm. The shape's width, depth and height then scale it, like any other
 * shape. Triangles that face inwards are turned round so cutting works. Throws, with a message fit
 * to show, when the model is flat or bigger than a shape may be.
 */
export function normalizeMesh(mesh: MeshData): { mesh: MeshData; size: [number, number, number] } {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < mesh.positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k]!, mesh.positions[i + k]!);
			max[k] = Math.max(max[k]!, mesh.positions[i + k]!);
		}
	}
	const size = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!] as [number, number, number];
	if (size.some((s) => !(s >= MIN_MODEL_SIZE))) throw new Error('This model is flat: it needs some thickness in every direction');
	if (size.some((s) => s > MAX_SHAPE_SIZE))
		throw new Error(`This model is too large: shapes can be at most ${MAX_SHAPE_SIZE} mm in each direction`);

	const positions = new Float32Array(mesh.positions.length);
	for (let i = 0; i < positions.length; i += 3) {
		positions[i] = (mesh.positions[i]! - (min[0]! + max[0]!) / 2) / size[0];
		positions[i + 1] = (mesh.positions[i + 1]! - (min[1]! + max[1]!) / 2) / size[1];
		positions[i + 2] = (mesh.positions[i + 2]! - min[2]!) / size[2];
	}
	const indices = Uint32Array.from(mesh.indices);
	if (signedVolume(mesh) < 0) {
		for (let t = 0; t < indices.length; t += 3) {
			const b = indices[t + 1]!;
			indices[t + 1] = indices[t + 2]!;
			indices[t + 2] = b;
		}
	}
	return { mesh: { positions, indices }, size };
}

export interface MeshShapeInput {
	name: string;
	/** Where the normalised mesh is stored (see isMeshRef). */
	ref: string;
	/** The model's real size in mm, from normalizeMesh. */
	size: [number, number, number];
}

/** Adds an imported model as a solid shape resting on the workplane, centred on `at`. Pure. */
export function addMeshShape(
	design: Design,
	input: MeshShapeInput,
	opts: { at?: [number, number]; id?: NodeId; now?: Date } = {},
): { design: Design; id: NodeId } {
	const id = opts.id ?? newId();
	const [width, depth, height] = input.size;
	const at = opts.at ?? [0, 0];
	const node: ShapeNode = {
		id,
		kind: 'shape',
		shapeType: MESH_SHAPE_TYPE,
		name: input.name,
		transform: translation(at[0], at[1], 0),
		mode: 'solid',
		color: '#8d99ae',
		hidden: false,
		locked: false,
		params: { width, depth, height, mesh: input.ref, originalWidth: width, originalDepth: depth, originalHeight: height },
	};
	return {
		id,
		design: {
			...design,
			nodes: { ...design.nodes, [id]: node },
			roots: [...design.roots, id],
			updatedAt: (opts.now ?? new Date()).toISOString(),
		},
	};
}
