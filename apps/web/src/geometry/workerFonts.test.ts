import { describe, expect, it } from 'vitest';
import type { WorkerRequest } from './geometry.worker.ts';
import { fontsNeededBy } from './workerFonts.ts';

const text = (id: string, font: number) => ({ id, kind: 'shape', shapeType: 'text', params: { font } });
const nodes = { a: text('a', 4), b: text('b', 9), c: { id: 'c', kind: 'shape', shapeType: 'box', params: {} } } as never;

describe('fontsNeededBy', () => {
	it('is the fonts of a group’s or an edge job’s shapes', () => {
		const group = { kind: 'group', id: 1, subtree: { rootId: 'g', nodes }, meshes: new Map() } as unknown as WorkerRequest;
		const edges = { ...group, kind: 'edges' } as unknown as WorkerRequest;
		expect(fontsNeededBy(group)).toEqual([4, 9]);
		expect(fontsNeededBy(edges)).toEqual([4, 9]);
	});

	it('is the fonts of the design for an export or an engraving', () => {
		const exporting = { kind: 'export', id: 1, design: { nodes, roots: ['a'] }, meshes: new Map() } as unknown as WorkerRequest;
		const engraving = { ...exporting, kind: 'engrave' } as unknown as WorkerRequest;
		expect(fontsNeededBy(exporting)).toEqual([4, 9]);
		expect(fontsNeededBy(engraving)).toEqual([4, 9]);
	});

	it('is nothing for a drawing import, which has no text', () => {
		expect(fontsNeededBy({ kind: 'svg', id: 1, text: '<svg/>', depth: 1 })).toEqual([]);
	});
});
