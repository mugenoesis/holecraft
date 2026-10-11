import type { ExportBody } from '../export.ts';
import { formatNumber, oneLine, requireBodies } from './shared.ts';

/** Wavefront OBJ text: one named object per body, vertices in mm, faces numbered from 1. */
export function writeObj(bodies: readonly ExportBody[]): string {
	requireBodies(bodies);
	const lines = ['# Holecraft export', '# units: mm'];
	let vertexBase = 0;

	for (const { name, mesh } of bodies) {
		lines.push(`o ${oneLine(name, 'body')}`);
		const p = mesh.positions;
		for (let i = 0; i < p.length; i += 3) lines.push(`v ${formatNumber(p[i]!)} ${formatNumber(p[i + 1]!)} ${formatNumber(p[i + 2]!)}`);
		for (let t = 0; t < mesh.indices.length; t += 3) {
			lines.push(
				`f ${mesh.indices[t]! + vertexBase + 1} ${mesh.indices[t + 1]! + vertexBase + 1} ${mesh.indices[t + 2]! + vertexBase + 1}`,
			);
		}
		vertexBase += p.length / 3;
	}
	return `${lines.join('\n')}\n`;
}
