import { addShape, createEmptyDesign, type Design, type EdgeTreatment, setEdgeTreatments } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import type { GroupResult } from '../geometry/GeometryService.ts';
import { skippedEdgeNotices } from './skippedEdges.ts';

const T = (id: string): EdgeTreatment => ({
	id,
	kind: 'chamfer',
	size: 2,
	points: [
		[-10, -10, 20],
		[10, -10, 20],
	],
	normals: [
		[
			[0, 0, 1],
			[0, -1, 0],
		],
	],
});
const mesh = (skippedEdges?: string[]) => ({
	positions: new Float32Array(),
	indices: new Uint32Array(),
	...(skippedEdges && { skippedEdges }),
});

function design(): Design {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [50, 0], { id: 'b' }).design;
	d = setEdgeTreatments(d, 'a', [T('e1'), T('e2')]);
	return setEdgeTreatments(d, 'b', [T('e3')]);
}

describe('skippedEdgeNotices', () => {
	it('lists, per object, the treatments its last result could not apply', () => {
		const results = new Map<string, GroupResult>([
			['a', { hash: 'x', mesh: mesh(['e2']) }],
			['b', { hash: 'y', mesh: mesh() }],
		]);
		expect(skippedEdgeNotices(design(), results)).toEqual([{ id: 'a', name: 'Box 1', ids: ['e2'] }]);
	});

	it('leaves out treatments that have since been removed, and objects that are gone', () => {
		const results = new Map<string, GroupResult>([
			['a', { hash: 'x', mesh: mesh(['e2', 'old']) }],
			['zzz', { hash: 'z', mesh: mesh(['e9']) }],
		]);
		expect(skippedEdgeNotices(design(), results)).toEqual([{ id: 'a', name: 'Box 1', ids: ['e2'] }]);
	});

	it('is empty when everything applied, or nothing was cut', () => {
		expect(skippedEdgeNotices(design(), new Map())).toEqual([]);
		expect(skippedEdgeNotices(design(), new Map([['a', { hash: 'x', mesh: null }]]))).toEqual([]);
	});
});
