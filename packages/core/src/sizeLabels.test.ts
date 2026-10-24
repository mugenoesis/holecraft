import { describe, expect, it } from 'vitest';
import { addShape, createEmptyDesign } from './index.ts';
import { sizeAnchors, sizeEditTarget } from './sizeLabels.ts';

const bounds = { min: [10, 20, 0] as [number, number, number], max: [30, 50, 8] as [number, number, number] };

describe('sizeAnchors', () => {
	it('gives the width, depth and height with the middle of the edge each is measured along', () => {
		const a = sizeAnchors(bounds);
		expect(a.map((x) => [x.axis, x.length])).toEqual([
			['x', 20],
			['y', 30],
			['z', 8],
		]);
		expect(a[0]!.from).toEqual([10, 20, 0]);
		expect(a[0]!.to).toEqual([30, 20, 0]);
		expect(a[1]!.from).toEqual([30, 20, 0]);
		expect(a[1]!.to).toEqual([30, 50, 0]);
		expect(a[2]!.from).toEqual([10, 20, 0]);
		expect(a[2]!.to).toEqual([10, 20, 8]);
	});
});

describe('sizeEditTarget', () => {
	const d = addShape(createEmptyDesign('0123456789abcdef0123456789abcdef', 'D'), 'box', [0, 0], { id: 'a' }).design;
	it('is the node when one unturned node is selected', () => {
		expect(sizeEditTarget(d, ['a'])).toEqual({ id: 'a', group: false });
	});
	it('is null for none or several', () => {
		expect(sizeEditTarget(d, [])).toBeNull();
		expect(sizeEditTarget(d, ['a', 'b'])).toBeNull();
	});
	it('is null for a node that is turned about any axis', () => {
		const t = [...d.nodes.a!.transform];
		const c = Math.cos(0.5);
		const s = Math.sin(0.5);
		t[0] = c;
		t[1] = s;
		t[4] = -s;
		t[5] = c;
		const turned = { ...d, nodes: { ...d.nodes, a: { ...d.nodes.a!, transform: t } } };
		expect(sizeEditTarget(turned as typeof d, ['a'])).toBeNull();
	});
});
