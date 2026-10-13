import { describe, expect, it } from 'vitest';
import { type MeshData, reorientMesh, signedVolume } from './meshShape.ts';

/** A box 10 along x, 20 along y and 30 along z, one corner at the origin, facing outwards. */
function box(): MeshData {
	const [a, b, c] = [10, 20, 30];
	const positions = new Float32Array([0, 0, 0, a, 0, 0, a, b, 0, 0, b, 0, 0, 0, c, a, 0, c, a, b, c, 0, b, c]);
	const faces = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
	return { positions, indices: new Uint32Array(faces) };
}
const extent = (m: MeshData) =>
	[0, 1, 2].map((k) => {
		const v = Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[i * 3 + k]!);
		return Math.max(...v) - Math.min(...v);
	});

describe('reorientMesh', () => {
	it('leaves a model that is already Z-up exactly as it is (the same mesh back)', () => {
		const m = box();
		expect(reorientMesh(m, 'z')).toBe(m);
	});

	it('stands a Y-up model upright: its y becomes the height and its z the depth, so 10 x 20 x 30 becomes 10 x 30 x 20', () => {
		expect(extent(reorientMesh(box(), 'y'))).toEqual([10, 30, 20]);
	});

	it('is a turn, not a mirror: the volume and the facing of every triangle are kept', () => {
		const [before, after] = [box(), reorientMesh(box(), 'y')];
		expect(signedVolume(after)).toBeCloseTo(signedVolume(before), 6);
		expect(signedVolume(after)).toBeGreaterThan(0);
		expect(Array.from(after.indices)).toEqual(Array.from(before.indices));
	});

	it('moves each point (x, y, z) to (x, -z, y), and does not change the model it was given', () => {
		const m = box();
		const out = reorientMesh(m, 'y');
		expect(Array.from(out.positions.slice(0, 3))).toEqual([0, 0, 0]);
		expect(Array.from(out.positions.slice(12, 15))).toEqual([0, -30, 0]); // (0, 0, 30) -> (0, -30, 0)
		expect(Array.from(out.positions.slice(9, 12))).toEqual([0, 0, 20]); // (0, 20, 0) -> (0, -0, 20)
		expect(Array.from(m.positions.slice(12, 15))).toEqual([0, 0, 30]);
	});
});
