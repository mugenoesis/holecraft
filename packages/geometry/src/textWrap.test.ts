import { addShape, createEmptyDesign, type Design, type ShapeNode, setShapeSize, setTextWrap, wrapOf, wrappedBox } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup } from './evaluate.ts';
import { loadManifold } from './load.ts';
import type { GroupMesh } from './types.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
	M = await loadManifold();
});

function volume(mesh: GroupMesh): number {
	const p = mesh.positions;
	let sum = 0;
	for (let i = 0; i < mesh.indices.length; i += 3) {
		const [a, b, c] = [mesh.indices[i]! * 3, mesh.indices[i + 1]! * 3, mesh.indices[i + 2]! * 3];
		sum +=
			(p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
				p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
				p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
			6;
	}
	return sum;
}

/** The text shape 'Hi', 40 wide (along the line), 10 high (letters) and 3 thick, wrapped at `radius` (none for flat). */
function wrapped(radius?: number, thick = 3, wide = 40): { design: Design; node: ShapeNode } {
	let design = addShape(createEmptyDesign('t'), 'text', [0, 0], { id: 't' }).design;
	design = setShapeSize(design, 't', { width: wide, depth: 10, height: thick });
	if (radius !== undefined) design = setTextWrap(design, 't', radius);
	return { design, node: design.nodes.t as ShapeNode };
}

const mesh = (d: Design) => evaluateGroup(M, d, 't')!;

function extent(m: GroupMesh) {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < m.positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k]!, m.positions[i + k]!);
			max[k] = Math.max(max[k]!, m.positions[i + k]!);
		}
	}
	return { min, max };
}

/** Every vertex's distance from the cylinder's axis (the line along y, through (0, *, centreZ)). */
function distances(m: GroupMesh, centreZ: number): [number, number] {
	let [low, high] = [Infinity, -Infinity];
	for (let i = 0; i < m.positions.length; i += 3) {
		const d = Math.hypot(m.positions[i]!, m.positions[i + 2]! - centreZ);
		low = Math.min(low, d);
		high = Math.max(high, d);
	}
	return [low, high];
}

describe('text wrapped round a cylinder', () => {
	it('is the same flat solid as before when there is no wrap', () => {
		const flat = mesh(wrapped().design);
		const zero = mesh(wrapped(0).design);
		expect(volume(zero)).toBeCloseTo(volume(flat), 9);
		expect(zero.indices.length).toBe(flat.indices.length);
	});

	it('outside a cylinder of radius 30: every point is between 30 and 33 mm from the axis, which is 30 mm below the base', () => {
		const [low, high] = distances(mesh(wrapped(30).design), -30);
		expect(low).toBeGreaterThan(30 - 0.02);
		expect(high).toBeLessThan(33 + 0.02);
		expect(low).toBeLessThan(30.3); // the base really is on the cylinder
		expect(high).toBeGreaterThan(32.7); // and the top is a thickness out
	});

	it('inside a cylinder of radius 30: between 27 and 30 mm from an axis 30 mm above the base', () => {
		const [low, high] = distances(mesh(wrapped(-30).design), 30);
		expect(low).toBeGreaterThan(27 - 0.02);
		expect(high).toBeLessThan(30 + 0.02);
		expect(low).toBeLessThan(27.3);
		expect(high).toBeGreaterThan(29.7);
	});

	it('fills the box the core works out for it (so bounds, drop to workplane and the export question are right)', () => {
		for (const radius of [30, 12, -30, -12]) {
			const { design, node } = wrapped(radius);
			const { width, depth, height } = node.params as { width: number; depth: number; height: number };
			const want = wrappedBox(width, depth, height, wrapOf(node));
			const got = extent(mesh(design));
			for (const k of [0, 1, 2]) {
				expect(got.min[k], `radius ${radius} min ${k}`).toBeCloseTo(want.min[k]!, 1);
				expect(got.max[k], `radius ${radius} max ${k}`).toBeCloseTo(want.max[k]!, 1);
			}
		}
	});

	it('keeps the letters as thick as they were: the volume grows only by the outer surface being larger (1 + thickness / 2 radius)', () => {
		const flat = volume(mesh(wrapped().design));
		expect(volume(mesh(wrapped(30).design))).toBeCloseTo(flat * (1 + 3 / (2 * 30)), -1);
		expect(volume(mesh(wrapped(-30).design))).toBeCloseTo(flat * (1 - 3 / (2 * 30)), -1);
		expect(volume(mesh(wrapped(30).design)) / flat).toBeGreaterThan(1.03);
		expect(volume(mesh(wrapped(30).design)) / flat).toBeLessThan(1.07);
	});

	it('is a single closed solid (positive volume) even when it goes most of the way round', () => {
		const round = mesh(wrapped(8, 3, 40).design); // 40 mm of line on an 8 mm radius: nearly 290 degrees
		expect(volume(round)).toBeGreaterThan(100);
		const [low, high] = distances(round, -8);
		expect(low).toBeGreaterThan(8 - 0.05);
		expect(high).toBeLessThan(11 + 0.05);
	});

	it('is cut finely enough to follow the curve: a long line of a small radius still lies on the cylinder', () => {
		const [low] = distances(mesh(wrapped(10, 3, 50).design), -10);
		expect(low).toBeGreaterThan(10 - 0.05);
	});
});
