import { ModelBuilder as Builder, type Design, type ModelBuilder, newId } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { collectBodies, type ExportBody } from './export.ts';
import { type BodyReport, measureBodies } from './measure.ts';

/** A model described in code: it adds parts to the builder it is given. */
export type ModelFn = (m: ModelBuilder) => void | Promise<void>;

export interface BuiltModel {
	design: Design;
	/** What an export would produce, one body per top-level solid shape or group. */
	bodies: ExportBody[];
	reports: BodyReport[];
	/** Things that are legal in Holecraft but almost never what was meant. Empty when the model looks right. */
	warnings: string[];
}

/**
 * Things worth saying about a built model. Holecraft accepts all of these quietly: a hole outside a group is just a ghost, a body with a
 * gap in its surface still draws, and an empty design exports an empty file.
 */
export function modelWarnings(design: Design, reports: readonly BodyReport[]): string[] {
	const warnings: string[] = [];
	for (const id of design.roots) {
		const node = design.nodes[id];
		if (node?.mode === 'hole') warnings.push(`Hole "${node.name}" is not grouped with a solid, so it cuts nothing (group them to cut)`);
	}
	if (reports.length === 0) warnings.push('Nothing would export: there is no solid top-level shape or group');
	for (const r of reports) {
		if (!r.closed) warnings.push(`"${r.name}" is not a closed surface (${r.problems.join('; ')}), so a slicer may reject it`);
	}
	return warnings;
}

/**
 * Runs a model description, works out the real geometry the way an export would (holes cut, groups joined) and measures it. A part the
 * builder refuses throws a `ModelBuildError` that names the part. Nothing is saved.
 */
export async function buildModel(M: ManifoldToplevel, name: string, model: ModelFn, opts: { id?: string } = {}): Promise<BuiltModel> {
	const builder = new Builder(name, opts.id ?? newId());
	await model(builder);
	const bodies = collectBodies(M, builder.design);
	const reports = measureBodies(bodies);
	return { design: builder.design, bodies, reports, warnings: modelWarnings(builder.design, reports) };
}
