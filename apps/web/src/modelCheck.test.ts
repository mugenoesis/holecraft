import type { MeshHealth, MeshRepairResult } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { canRepair, describeHealth, repairNote } from './modelCheck.ts';

const healthy: MeshHealth = {
	triangles: 12,
	openEdges: 0,
	nonManifoldEdges: 0,
	flippedEdges: 0,
	degenerate: 0,
	insideOut: 0,
	closed: true,
};
const faulty = (extra: Partial<MeshHealth>): MeshHealth => ({ ...healthy, closed: false, ...extra });

describe('describeHealth', () => {
	it('says a closed model is a closed surface, and how many triangles it has', () => {
		expect(describeHealth(healthy)).toEqual(['Closed surface (12 triangles)']);
		expect(describeHealth({ ...healthy, triangles: 1 })).toEqual(['Closed surface (1 triangle)']);
	});

	it('says each fault in words, with the number', () => {
		expect(describeHealth(faulty({ openEdges: 3 }))).toEqual(['3 open edges: holes in the surface']);
		expect(describeHealth(faulty({ openEdges: 1 }))).toEqual(['1 open edge: a hole in the surface']);
		expect(describeHealth(faulty({ flippedEdges: 4 }))).toEqual(['4 edges where neighbouring triangles face opposite ways']);
		expect(describeHealth(faulty({ degenerate: 2 }))).toEqual(['2 triangles with no area']);
		expect(describeHealth(faulty({ insideOut: 12 }))).toEqual(['The surface faces inwards (inside out)']);
		expect(describeHealth(faulty({ nonManifoldEdges: 1 }))).toEqual([
			'1 edge shared by three or more triangles (cannot be mended automatically)',
		]);
	});

	it('lists every fault there is', () => {
		expect(describeHealth(faulty({ openEdges: 3, degenerate: 1, nonManifoldEdges: 2 }))).toHaveLength(3);
	});
});

describe('canRepair', () => {
	it('is for holes, flipped triangles, empty triangles and an inside-out surface', () => {
		for (const fault of [{ openEdges: 1 }, { flippedEdges: 1 }, { degenerate: 1 }, { insideOut: 3 }])
			expect(canRepair(faulty(fault))).toBe(true);
	});

	it('is not for a closed model, or one whose only fault cannot be mended automatically', () => {
		expect(canRepair(healthy)).toBe(false);
		expect(canRepair(faulty({ nonManifoldEdges: 2 }))).toBe(false);
	});
});

describe('repairNote', () => {
	const result = (fixed: Partial<MeshRepairResult['fixed']>, health: MeshHealth = healthy): Pick<MeshRepairResult, 'fixed' | 'health'> => ({
		fixed: { flippedFaces: 0, degenerateRemoved: 0, holesFilled: 0, holesLeft: 0, ...fixed },
		health,
	});

	it('says what was done', () => {
		expect(repairNote(result({ holesFilled: 1 }))).toBe('Repaired: filled 1 hole.');
		expect(repairNote(result({ holesFilled: 2, flippedFaces: 14, degenerateRemoved: 3 }))).toBe(
			'Repaired: filled 2 holes, turned 14 triangles round, removed 3 triangles with no area.',
		);
	});

	it('says what is still wrong', () => {
		const note = repairNote(result({ holesFilled: 1, holesLeft: 1 }, faulty({ openEdges: 5 })));
		expect(note).toContain('filled 1 hole');
		expect(note).toContain('1 hole could not be filled');
	});

	it('says when nothing could be done', () => {
		expect(repairNote(result({}, faulty({ nonManifoldEdges: 2 })))).toBe('Nothing here can be mended automatically.');
	});
});
