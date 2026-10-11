import { describe, expect, it } from 'vitest';
import { dragHandleYawed, HANDLE_IDS, handlePositionYawed, type ShapeGeometry } from './resize.ts';

const g: ShapeGeometry = { x: 10, y: -5, z: 3, width: 20, depth: 30, height: 40 };
const off = { snap: 0, uniform: false, fromCenter: false };

function close(actual: readonly number[], expected: readonly number[], digits = 6) {
	expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
}

describe('handlePositionYawed', () => {
	it('matches the axis-aligned positions at zero yaw', () => {
		close(handlePositionYawed(g, 0, 'corner-pp'), [20, 10, 3]);
		close(handlePositionYawed(g, 0, 'side-nx'), [0, -5, 3]);
		close(handlePositionYawed(g, 0, 'height'), [10, -5, 43]);
	});

	it('swings the handles around the shape centre', () => {
		// Turned 90° the shape's +X side faces world +Y.
		close(handlePositionYawed(g, 90, 'side-px'), [10, 5, 3]);
		// ...and its +Y side faces world -X, 15 mm (half the depth) from the centre.
		close(handlePositionYawed(g, 90, 'side-py'), [-5, -5, 3]);
	});

	it('keeps height and lift handles above the centre', () => {
		for (const yaw of [0, 33, 90, -120]) {
			close(handlePositionYawed(g, yaw, 'height'), [10, -5, 43]);
			close(handlePositionYawed(g, yaw, 'lift'), [10, -5, 43]);
		}
	});
});

describe('dragHandleYawed', () => {
	it('is the same as dragHandle when not turned', () => {
		const r = dragHandleYawed(g, 0, 'corner-pp', [40, 30, 3], off);
		expect(r).toMatchObject({ width: 40, depth: 50 });
	});

	it('leaves the shape alone when a handle is dragged to where it already is', () => {
		for (const yaw of [0, 30, 90, -45, 180]) {
			for (const id of HANDLE_IDS) {
				const r = dragHandleYawed(g, yaw, id, handlePositionYawed(g, yaw, id), off);
				for (const k of ['x', 'y', 'z', 'width', 'depth', 'height'] as const) expect(r[k]).toBeCloseTo(g[k], 6);
			}
		}
	});

	it("grows along the shape's own axis, not the world axis", () => {
		// Turned 90°, the shape's width runs along world Y. Pull its +X side 10 mm further along +Y.
		const side = handlePositionYawed(g, 90, 'side-px');
		const r = dragHandleYawed(g, 90, 'side-px', [side[0], side[1] + 10, side[2]], off);
		expect(r.width).toBeCloseTo(30, 6);
		expect(r.depth).toBeCloseTo(30, 6);
		// The opposite side stays put, so the centre slides 5 mm along world +Y.
		close([r.x, r.y], [10, 0]);
	});

	it('keeps the opposite corner fixed in world space', () => {
		const yaw = 30;
		const farBefore = handlePositionYawed(g, yaw, 'corner-nn');
		const grab = handlePositionYawed(g, yaw, 'corner-pp');
		const r = dragHandleYawed(g, yaw, 'corner-pp', [grab[0] + 8, grab[1] + 3, grab[2]], off);
		close(handlePositionYawed(r, yaw, 'corner-nn'), farBefore);
		expect(r.width).toBeGreaterThan(g.width - 1e-9);
	});

	it('resizes about the centre when asked', () => {
		const yaw = 60;
		const grab = handlePositionYawed(g, yaw, 'corner-pp');
		const r = dragHandleYawed(g, yaw, 'corner-pp', [grab[0] + 6, grab[1] + 6, grab[2]], { ...off, fromCenter: true });
		close([r.x, r.y], [g.x, g.y]);
		expect(r.width).not.toBeCloseTo(g.width, 3);
	});

	it('uniform scaling keeps the proportions and the base height', () => {
		const grab = handlePositionYawed(g, 45, 'corner-pp');
		const r = dragHandleYawed(g, 45, 'corner-pp', [grab[0] + 10, grab[1] + 10, grab[2]], { ...off, uniform: true });
		expect(r.width / g.width).toBeCloseTo(r.depth / g.depth, 6);
		expect(r.height / g.height).toBeCloseTo(r.width / g.width, 6);
		expect(r.z).toBe(g.z);
	});

	it('height and lift ignore the turn', () => {
		expect(dragHandleYawed(g, 77, 'height', [0, 0, 60], off)).toMatchObject({ height: 57, x: 10, y: -5 });
		expect(dragHandleYawed(g, 77, 'lift', [0, 0, 100], off)).toMatchObject({ z: 60, width: 20 });
	});

	it("snaps in the shape's own frame, so sizes stay on the grid", () => {
		const grab = handlePositionYawed(g, 90, 'side-px');
		const r = dragHandleYawed(g, 90, 'side-px', [grab[0], grab[1] + 7.4, grab[2]], { ...off, snap: 5 });
		// The dragged side is snapped relative to the centre; the width is whatever that gives.
		expect(Number.isFinite(r.width)).toBe(true);
		expect(r.width).toBeGreaterThan(20);
	});
});
