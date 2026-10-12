import type { EdgeTreatment, MeshEdge } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { EdgePreview } from './edgePreview.ts';

const EDGE: MeshEdge = {
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
	closed: false,
};
const OLD: EdgeTreatment = { id: 'old', kind: 'chamfer', size: 1, points: EDGE.points, normals: EDGE.normals };

/** A preview of node 'a' that records what it tells the editor. */
function recorder() {
	const calls: string[] = [];
	let shown: EdgeTreatment[] = [];
	let n = 0;
	const preview = new EdgePreview(
		'a',
		{
			onStart: () => calls.push('start'),
			onPreview: (id, edges) => {
				calls.push(`preview ${id}`);
				shown = edges;
			},
			onApply: () => calls.push('apply'),
			onCancel: () => calls.push('cancel'),
		},
		() => `t${++n}`,
	);
	return { preview, calls, shown: () => shown };
}

describe('the Edge tool preview', () => {
	it('starts on the first choice, previews each change, and Apply ends it as one step', () => {
		const { preview, calls, shown } = recorder();
		preview.show([EDGE], [0], 'chamfer', 2);
		preview.show([EDGE], [0], 'round', 3);
		expect(shown()[0]).toMatchObject({ kind: 'round', size: 3 });
		preview.commit();
		expect(calls).toEqual(['start', 'preview a', 'preview a', 'apply']);
	});

	it('cancels when the choice is dropped, and does nothing more when there was no preview', () => {
		const { preview, calls } = recorder();
		preview.show([EDGE], [0], 'chamfer', 2);
		preview.show([EDGE], [], 'chamfer', 2);
		expect(calls).toEqual(['start', 'preview a', 'cancel']); // dropping the choice alone cancels
		preview.cancel();
		preview.show(null, [0], 'chamfer', 2); // edges not found yet
		preview.commit();
		expect(calls).toEqual(['start', 'preview a', 'cancel']);
	});

	it('builds on the treatments from before the preview, not on the preview itself', () => {
		const { preview, shown } = recorder();
		preview.follow([OLD]);
		preview.show([EDGE], [0], 'round', 2);
		preview.follow(shown()); // the design now shows the preview: ignored
		expect(preview.base).toEqual([OLD]);
		preview.show([EDGE], [0], 'round', 4);
		expect(shown()).toHaveLength(1); // the old chamfer was replaced, once
		preview.commit();
		preview.follow(shown()); // after Apply the design's treatments are the base again
		expect(preview.base).toEqual(shown());
	});

	it('Remove keeps a given list in one step, with or without a preview showing', () => {
		const { preview, calls } = recorder();
		preview.commit([]);
		preview.show([EDGE], [0], 'chamfer', 2);
		preview.commit([]);
		expect(calls).toEqual(['start', 'preview a', 'apply', 'start', 'preview a', 'preview a', 'apply']);
	});
});
