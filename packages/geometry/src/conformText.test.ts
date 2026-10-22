import { addShape, createEmptyDesign, type Design, setShapeSize, textOutlines } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ConformFrame, conformToSurface, OffSurfaceError } from './conformText.ts';
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

function extent(m: GroupMesh) {
	const min: number[] = [Infinity, Infinity, Infinity];
	const max: number[] = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < m.positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k]!, m.positions[i + k]!);
			max[k] = Math.max(max[k]!, m.positions[i + k]!);
		}
	}
	return { min, max };
}

/** A shape of the given kind, sized, at the origin (so a 20 mm box spans z 0 to 20). */
function shaped(type: 'box' | 'sphere', size: number): GroupMesh {
	let d: Design = addShape(createEmptyDesign('t'), type, [0, 0], { id: 's' }).design;
	d = setShapeSize(d, 's', { width: size, depth: size, height: size });
	return evaluateGroup(M, d, 's')!;
}

/** The mesh as a manifold, which throws if it is not a closed solid. */
function asSolid(mesh: GroupMesh) {
	return M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
}

const rect = (w: number, h: number, cx = 0, cy = 0): [number, number][] => [
	[cx - w / 2, cy - h / 2],
	[cx + w / 2, cy - h / 2],
	[cx + w / 2, cy + h / 2],
	[cx - w / 2, cy + h / 2],
];

/** Looking down at a point of the top: x right, y up the page, normal up. */
const topFrame = (z: number): ConformFrame => ({ origin: [0, 0, z], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] });

describe('conformToSurface: a flat face', () => {
	const box = () => shaped('box', 20);

	it('an engraving is the lettering from the surface down to the depth, with a little standing proud so the cut is clean', () => {
		const cut = conformToSurface(M, box(), topFrame(20), { polygons: [rect(10, 4)], depth: 3, mode: 'engrave' });
		expect(volume(cut)).toBeCloseTo(10 * 4 * (3 + 0.5), 1);
		const { min, max } = extent(cut);
		expect(min[2]).toBeCloseTo(17, 4);
		expect(max[2]).toBeCloseTo(20.5, 4);
		expect([min[0], max[0], min[1], max[1]].map((v) => Math.round(v! * 100) / 100)).toEqual([-5, 5, -2, 2]);
	});

	it('cutting it out of the box takes exactly lettering area x depth', () => {
		const cut = conformToSurface(M, box(), topFrame(20), { polygons: [rect(10, 4)], depth: 3, mode: 'engrave' });
		const left = asSolid(shaped('box', 20)).subtract(asSolid(cut));
		expect(8000 - left.volume()).toBeCloseTo(10 * 4 * 3, 1);
	});

	it('raised lettering stands the depth out of the surface, and a little way inside it so it joins', () => {
		const up = conformToSurface(M, box(), topFrame(20), { polygons: [rect(10, 4)], depth: 2, mode: 'raised' });
		expect(volume(up)).toBeCloseTo(10 * 4 * (2 + 0.4), 1);
		const { min, max } = extent(up);
		expect(min[2]).toBeCloseTo(19.6, 4);
		expect(max[2]).toBeCloseTo(22, 4);
		const joined = asSolid(shaped('box', 20)).add(asSolid(up));
		expect(joined.volume()).toBeCloseTo(8000 + 10 * 4 * 2, 1);
	});

	it('a hole in a letter stays a hole', () => {
		const ring = [rect(10, 10), [...rect(4, 4)].reverse()] as [number, number][][];
		const cut = conformToSurface(M, box(), topFrame(20), { polygons: ring, depth: 1, mode: 'engrave' });
		expect(volume(cut)).toBeCloseTo((100 - 16) * 1.5, 1);
	});

	it('works on a face that is not the top, with the depth measured into the face', () => {
		// the +x face: looking at it, y to the right and z up
		const frame: ConformFrame = { origin: [10, 0, 10], u: [0, 1, 0], v: [0, 0, 1], normal: [1, 0, 0] };
		const cut = conformToSurface(M, box(), frame, { polygons: [rect(6, 4)], depth: 2, mode: 'engrave' });
		const { min, max } = extent(cut);
		expect([min[0], max[0]].map((v) => Math.round(v! * 100) / 100)).toEqual([8, 10.5]);
		expect([min[1], max[1], min[2], max[2]].map((v) => Math.round(v! * 100) / 100)).toEqual([-3, 3, 8, 12]);
		expect(volume(cut)).toBeCloseTo(6 * 4 * 2.5, 1);
	});

	it('works on a tilted frame: the depth is along the normal', () => {
		const s = Math.SQRT1_2;
		// a plane through the top of the box tipped 45 degrees about y: the box's top face is level, so the rays from above the tilted plane still land on it
		const frame: ConformFrame = { origin: [0, 0, 20], u: [s, 0, -s], v: [0, 1, 0], normal: [s, 0, s] };
		const cut = conformToSurface(M, box(), frame, { polygons: [rect(2, 2)], depth: 1, mode: 'engrave' });
		expect(volume(cut)).toBeGreaterThan(0);
		asSolid(cut); // a closed solid
	});
});

describe('conformToSurface: a curved surface', () => {
	const R = 30;
	const sphere = () => shaped('sphere', 2 * R);
	/** Where the sphere's surface is above (x, y), looked at from above (it is centred at z = R). */
	const surfaceZ = (x: number, y: number) => R + Math.sqrt(R * R - x * x - y * y);

	it('follows the sphere: the bottom of the cut is one depth below the surface above it, the top half a mm above it', () => {
		const cut = conformToSurface(M, sphere(), topFrame(2 * R), { polygons: [rect(16, 8)], depth: 2, mode: 'engrave' });
		// the sphere is a mesh, a little inside the true sphere (by under 0.15 mm), so the true surface is a fraction of a mm from where the cut was fitted
		let [lowest, highest] = [Infinity, -Infinity];
		for (let i = 0; i < cut.positions.length; i += 3) {
			const above = cut.positions[i + 2]! - surfaceZ(cut.positions[i]!, cut.positions[i + 1]!);
			[lowest, highest] = [Math.min(lowest, above), Math.max(highest, above)];
		}
		expect(lowest).toBeGreaterThan(-2.35);
		expect(lowest).toBeLessThan(-1.95);
		expect(highest).toBeGreaterThan(0.25);
		expect(highest).toBeLessThan(0.55);
	});

	it('cutting it out takes about the lettering area x depth (the area seen from above, since the depth is straight down)', () => {
		const cut = conformToSurface(M, sphere(), topFrame(2 * R), { polygons: [rect(16, 8)], depth: 2, mode: 'engrave' });
		const left = asSolid(sphere()).subtract(asSolid(cut));
		expect(asSolid(sphere()).volume() - left.volume()).toBeCloseTo(16 * 8 * 2, -1);
	});

	it('real lettering on the sphere is a closed solid that cuts', () => {
		const text = textOutlines('Hi', 1)!;
		const [w, h] = [text.box.max[0] - text.box.min[0], text.box.max[1] - text.box.min[1]];
		const em = 12;
		const polygons = text.polygons.map((ring) =>
			ring.map(([x, y]): [number, number] => [(x - (text.box.min[0] + w / 2)) * em, (y - (text.box.min[1] + h / 2)) * em]),
		);
		const cut = conformToSurface(M, sphere(), topFrame(2 * R), { polygons, depth: 1.5, mode: 'engrave' });
		expect(volume(cut)).toBeGreaterThan(10);
		const left = asSolid(sphere()).subtract(asSolid(cut));
		expect(left.volume()).toBeLessThan(asSolid(sphere()).volume() - 5);
	});

	it('raised lettering on a sphere joins it into one solid', () => {
		const up = conformToSurface(M, sphere(), topFrame(2 * R), { polygons: [rect(10, 5)], depth: 1.5, mode: 'raised' });
		const joined = asSolid(sphere()).add(asSolid(up));
		expect(joined.volume()).toBeGreaterThan(asSolid(sphere()).volume() + 40);
	});
});

describe('conformToSurface: lettering that does not fit on the surface', () => {
	it('is refused, saying part of it is past the edge, when some of it hangs over the side of the face', () => {
		expect(() => conformToSurface(M, shaped('box', 20), topFrame(20), { polygons: [rect(30, 4)], depth: 1, mode: 'engrave' })).toThrow(
			OffSurfaceError,
		);
		try {
			conformToSurface(M, shaped('box', 20), topFrame(20), { polygons: [rect(30, 4)], depth: 1, mode: 'engrave' });
		} catch (e) {
			expect((e as Error).message).toMatch(/past the edge/i);
		}
	});

	it('is refused when none of it is over the shape', () => {
		expect(() =>
			conformToSurface(M, shaped('box', 20), topFrame(20), { polygons: [rect(4, 4, 100, 0)], depth: 1, mode: 'engrave' }),
		).toThrow(OffSurfaceError);
	});
});
