import { addShape, canUndo, createEmptyDesign, eulerOfTransform, eulerToMatrix, groupNodes, nodeBoundsIn } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

function start() {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [60, 0], { id: 'b' }).design;
	d = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
	return createEditorState(d);
}
const width = (s: ReturnType<typeof start>) => {
	const b = nodeBoundsIn(s.history.present, 'g')!;
	return b.max[0]! - b.min[0]!;
};

describe('turning a group', () => {
	it('a ring drag previews the turn and ends as one undo step', () => {
		let s = editorReducer({ ...start(), selection: ['g'] }, { type: 'moveStart' });
		s = editorReducer(s, { type: 'setRotation', id: 'g', rotation: eulerToMatrix([0, 0, 45]) });
		s = editorReducer(s, { type: 'setRotation', id: 'g', rotation: eulerToMatrix([0, 0, 90]) });
		s = editorReducer(s, { type: 'moveEnd' });
		expect(width(s)).toBeCloseTo(20);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(width(s)).toBeCloseTo(80);
	});

	it('typed angles turn a group too', () => {
		const s = editorReducer(start(), { type: 'setEuler', id: 'g', euler: [0, 0, 90] });
		expect(width(s)).toBeCloseTo(20);
		const e = eulerOfTransform(s.history.present.nodes.g!.transform);
		expect(e[2]).toBeCloseTo(90);
	});

	it('ignores a turn that is not part of the drag in progress', () => {
		const s = editorReducer(start(), { type: 'setRotation', id: 'g', rotation: eulerToMatrix([0, 0, 90]) });
		expect(width(s)).toBeCloseTo(80);
	});
});
