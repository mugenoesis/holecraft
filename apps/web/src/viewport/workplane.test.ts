import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWorkplane } from './workplane.ts';

/** How many line segments each of the three sets of lines (fine, strong and the border) has. */
function counts(group: THREE.Group): number[] {
	return group.children
		.filter((c): c is THREE.LineSegments => c instanceof THREE.LineSegments)
		.map((l) => l.geometry.getAttribute('position').count / 2);
}

const planeOf = (group: THREE.Group) => group.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;

describe('createWorkplane', () => {
	it('is a plate of the size asked for', () => {
		const p = planeOf(createWorkplane(300, 120)).geometry as THREE.PlaneGeometry;
		expect([p.parameters.width, p.parameters.height]).toEqual([300, 120]);
	});

	it('draws a line every millimetre and a strong one every ten, on the usual plate', () => {
		// 200 mm: 199 lines each way, 19 of them strong (every ten, none on the border)
		const [fine, strong, border] = counts(createWorkplane(200, 200));
		expect(strong).toBe(2 * 19);
		expect(fine).toBe(2 * (199 - 19));
		expect(border).toBe(4);
	});

	it('draws a line every ten millimetres and a strong one every hundred on a big plate, not a thousand lines', () => {
		// 1000 mm: 99 lines each way, 9 of them strong
		const [fine, strong] = counts(createWorkplane(1000, 1000));
		expect(strong).toBe(2 * 9);
		expect(fine).toBe(2 * (99 - 9));
	});

	it('keeps a strong line through the middle on every size', () => {
		for (const size of [
			[100, 100],
			[333, 207],
			[900, 450],
		] as const) {
			const strong = createWorkplane(size[0], size[1]).children.filter((c) => c instanceof THREE.LineSegments)[1] as THREE.LineSegments;
			const xs = new Set<number>();
			const pos = strong.geometry.getAttribute('position');
			for (let i = 0; i < pos.count; i++) xs.add(Math.round(pos.getX(i)));
			expect(xs.has(0), `${size}`).toBe(true);
		}
	});

	it('can still be given the spacing, as before', () => {
		const [fine, strong] = counts(createWorkplane(100, 100, { minor: 5, major: 50 }));
		expect(strong).toBe(2 * 1);
		expect(fine).toBe(2 * (19 - 1));
	});
});
