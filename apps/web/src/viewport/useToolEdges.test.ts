import { MAX_OFFERED_SEGMENTS, type MeshEdge } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { settled } from './useToolEdges.ts';

/** An edge made of `pieces` straight pieces. */
const edge = (pieces: number): MeshEdge => ({
	points: Array.from({ length: pieces + 1 }, (_, i) => [i, 0, 0] as [number, number, number]),
	normals: Array.from(
		{ length: pieces },
		() =>
			[
				[0, 0, 1],
				[0, -1, 0],
			] as [[number, number, number], [number, number, number]],
	),
	closed: false,
});

describe('the edges the tool is given', () => {
	it('are used when there are few enough to draw', () => {
		const edges = [edge(3), edge(1)];
		expect(settled('k', edges)).toEqual({ kind: 'ready', key: 'k', edges });
		expect(settled('k', [edge(MAX_OFFERED_SEGMENTS)]).kind).toBe('ready');
	});

	it('are refused, with their number, when there are too many pieces to draw without freezing the page', () => {
		expect(settled('k', [edge(MAX_OFFERED_SEGMENTS), edge(1)])).toEqual({ kind: 'tooMany', segments: MAX_OFFERED_SEGMENTS + 1 });
	});
});
