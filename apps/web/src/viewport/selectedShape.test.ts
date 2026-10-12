import { addShape, createEmptyDesign, type Design, groupNodes, setHidden, setLocked, setNodeEuler } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { selectedHandles, selectedRings, selectedShape } from './selectedShape.ts';

function scene(): Design {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [10, 20], { id: 'a' }).design;
	d = addShape(d, 'box', [60, 20], { id: 'b' }).design;
	return d;
}

describe('selectedShape', () => {
	it('describes the single selected shape for the handles', () => {
		const s = selectedShape(scene(), ['a'])!;
		expect(s.id).toBe('a');
		expect(s.geometry).toEqual({ x: 10, y: 20, z: 0, width: 20, depth: 20, height: 20 });
		expect(s.upright).toBe(true);
		expect(s.yaw).toBeCloseTo(0);
		expect(s.center).toEqual([10, 20, 10]);
		expect(s.ringRadius).toBeCloseTo(Math.hypot(20, 20, 20) / 2 + 6);
	});

	it('reports a tipped shape as not upright, and its yaw when turned about z', () => {
		expect(selectedShape(setNodeEuler(scene(), 'a', [30, 0, 0]), ['a'])!.upright).toBe(false);
		expect(selectedShape(setNodeEuler(scene(), 'a', [0, 0, 40]), ['a'])!.yaw).toBeCloseTo(40);
	});

	it('is null for no selection, several, a missing id, a group, a locked or hidden shape', () => {
		const d = scene();
		expect(selectedShape(d, [])).toBeNull();
		expect(selectedShape(d, ['a', 'b'])).toBeNull();
		expect(selectedShape(d, ['nope'])).toBeNull();
		expect(selectedShape(setLocked(d, ['a'], true), ['a'])).toBeNull();
		expect(selectedShape(setHidden(d, ['a'], true), ['a'])).toBeNull();
		const g = groupNodes(d, ['a', 'b'], { id: 'g' });
		expect(selectedShape(g.design, ['g'])).toBeNull();
	});
});

describe('selectedRings', () => {
	it('gives a shape its middle and a radius just outside it', () => {
		const r = selectedRings(scene(), ['a'])!;
		expect(r.id).toBe('a');
		expect(r.center).toEqual([10, 20, 10]);
		expect(r.radius).toBeCloseTo(Math.hypot(20, 20, 20) / 2 + 6);
	});

	it('gives a group the middle of everything in it', () => {
		const g = groupNodes(scene(), ['a', 'b'], { id: 'g' });
		const r = selectedRings(g.design, ['g'])!;
		expect(r.id).toBe('g');
		expect(r.center[0]).toBeCloseTo(35);
		expect(r.center[1]).toBeCloseTo(20);
		expect(r.center[2]).toBeCloseTo(10);
		expect(r.rotation).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
	});

	it('is null for nothing, several, locked or hidden things', () => {
		const g = groupNodes(scene(), ['a', 'b'], { id: 'g' }).design;
		expect(selectedRings(g, [])).toBeNull();
		expect(selectedRings(scene(), ['a', 'b'])).toBeNull();
		expect(selectedRings(setLocked(g, ['g'], true), ['g'])).toBeNull();
		expect(selectedRings(setHidden(g, ['g'], true), ['g'])).toBeNull();
		expect(selectedRings(g, ['nope'])).toBeNull();
	});
});

describe('selectedHandles', () => {
	it('gives an upright shape its geometry and yaw', () => {
		const h = selectedHandles(setNodeEuler(scene(), 'a', [0, 0, 30]), ['a'])!;
		expect(h.id).toBe('a');
		expect(h.geometry.width).toBe(20);
		expect(h.yaw).toBeCloseTo(30);
	});

	it('gives a group the box around its contents', () => {
		const g = groupNodes(scene(), ['a', 'b'], { id: 'g' }).design;
		const h = selectedHandles(g, ['g'])!;
		expect(h.id).toBe('g');
		expect(h.geometry).toEqual({ x: 35, y: 20, z: 0, width: 70, depth: 20, height: 20 });
		expect(h.yaw).toBeCloseTo(0);
	});

	it('is null for a tipped shape, a group that cannot be scaled exactly, and the usual nothing cases', () => {
		const d = scene();
		expect(selectedHandles(setNodeEuler(d, 'a', [30, 0, 0]), ['a'])).toBeNull();
		const grouped = groupNodes(setNodeEuler(d, 'a', [0, 0, 45]), ['a', 'b'], { id: 'g' }).design;
		expect(selectedHandles(grouped, ['g'])).toBeNull();
		expect(selectedHandles(d, [])).toBeNull();
		expect(selectedHandles(d, ['a', 'b'])).toBeNull();
		expect(selectedHandles(setLocked(d, ['a'], true), ['a'])).toBeNull();
		const g2 = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
		expect(selectedHandles(setHidden(g2, ['g'], true), ['g'])).toBeNull();
		expect(selectedHandles(setLocked(g2, ['g'], true), ['g'])).toBeNull();
	});
});
