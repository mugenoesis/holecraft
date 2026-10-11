import type { ExportBody } from '../export.ts';

export function requireBodies(bodies: readonly ExportBody[]): void {
	if (bodies.length === 0) throw new Error('Nothing to export: there are no solid shapes in this design');
}

/** A number as plain decimal text (no exponent), with float noise trimmed: 0.1 + 0.2 becomes 0.3. */
export function formatNumber(n: number): string {
	return String(Number(n.toFixed(6)) + 0);
}

/** A name that is safe on one line of a text file: control characters (including newlines) become spaces. */
export function oneLine(name: string, fallback: string): string {
	return (
		name
			.replace(/[\u0000-\u001f\u007f]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim() || fallback
	);
}

export const triangleCount = (bodies: readonly ExportBody[]): number => bodies.reduce((n, b) => n + b.mesh.indices.length / 3, 0);
