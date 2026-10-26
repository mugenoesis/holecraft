import type { Bounds, MeshData, MeshShapeInput } from '@holecraft/core';
import type { ClosedCavity, GroupMesh } from '@holecraft/geometry';
import { boundsOf, stlFile } from './engraveJob.ts';

/** The reader that stores an imported model, passed in so the job is tested without it. */
interface Deps {
	read: (file: {
		name: string;
		size: number;
		arrayBuffer: () => Promise<ArrayBuffer>;
	}) => Promise<{ input: MeshShapeInput; mesh: MeshData }>;
}

export type FillOutcome =
	| { error: null; input: MeshShapeInput; bounds: Bounds; mesh: MeshData }
	| { error: string; input: null; bounds: null };

/** The fills of several cavities as one mesh: they do not touch, so each keeps its own corners. */
export function joinFills(cavities: readonly ClosedCavity[]): GroupMesh {
	const positions = new Float32Array(cavities.reduce((n, c) => n + c.fill.positions.length, 0));
	const indices = new Uint32Array(cavities.reduce((n, c) => n + c.fill.indices.length, 0));
	let [at, to] = [0, 0];
	for (const { fill } of cavities) {
		positions.set(fill.positions, at);
		for (let i = 0; i < fill.indices.length; i++) indices[to + i] = fill.indices[i]! + at / 3;
		at += fill.positions.length;
		to += fill.indices.length;
	}
	return { positions, indices };
}

/**
 * Reads the fill of these cavities back as an imported model (the road Engrave takes: an STL, then the stored mesh) and gives it with its name and
 * the box it fills in the world. A failure is an outcome with words for the panel.
 */
export async function runFill(cavities: readonly ClosedCavity[], deps: Deps): Promise<FillOutcome> {
	if (cavities.length === 0) return { error: 'There is no cavity to fill', input: null, bounds: null };
	try {
		const joined = joinFills(cavities);
		const name = cavities.length === 1 ? `Cavity ${cavities[0]!.id + 1} fill` : 'Cavity fill';
		const { input, mesh } = await deps.read(stlFile('cavity-fill', joined));
		return { error: null, input: { ...input, name }, bounds: boundsOf(joined), mesh };
	} catch (error) {
		return { error: error instanceof Error ? error.message : 'The cavity could not be filled', input: null, bounds: null };
	}
}
