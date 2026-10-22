import { addShape, createEmptyDesign, type Design, setNodeMode, setShapeSize } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
beforeEach(() => {
	scene = new DesignScene();
});

/** A solid box 'a' and a hole box 'h'. */
function design(): Design {
	let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
	d = setShapeSize(d, 'a', { width: 20, depth: 20, height: 20 });
	d = addShape(d, 'box', [40, 0], { id: 'h' }).design;
	return setNodeMode(setShapeSize(d, 'h', { width: 10, depth: 10, height: 10 }), ['h'], 'hole');
}

const material = (id: string) => {
	const mesh = scene.root.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.userData.nodeId === id)!;
	return mesh.material as THREE.MeshStandardMaterial;
};

describe('DesignScene: X-ray', () => {
	it('draws a solid opaque, and a hole as a ghost, until X-ray is on', () => {
		scene.sync(design());
		expect(material('a').transparent).toBe(false);
		expect(material('a').opacity).toBe(1);
		expect(material('h').transparent).toBe(true);
	});

	it('makes solids see-through (and not writing depth), and leaves a hole a ghost', () => {
		scene.setXray({ seeThrough: true, cut: null });
		scene.sync(design());
		expect(material('a').transparent).toBe(true);
		expect(material('a').opacity).toBeLessThan(0.6);
		expect(material('a').opacity).toBeGreaterThan(0);
		expect(material('a').depthWrite).toBe(false);
		expect(material('h').transparent).toBe(true);
	});

	it('puts a solid back to opaque when X-ray goes off, without a new design', () => {
		const d = design();
		scene.setXray({ seeThrough: true, cut: null });
		scene.sync(d);
		scene.setXray({ seeThrough: false, cut: null });
		scene.sync(d);
		expect(material('a').transparent).toBe(false);
		expect(material('a').opacity).toBe(1);
		expect(material('a').depthWrite).toBe(true);
	});

	it('cuts away what is past the plane, drawing both sides of what is left so the inside shows', () => {
		scene.setXray({ seeThrough: false, cut: { axis: 'z', at: 12 } });
		scene.sync(design());
		const m = material('a');
		expect(m.clippingPlanes).toHaveLength(1);
		const plane = m.clippingPlanes![0]!;
		expect(plane.distanceToPoint(new THREE.Vector3(0, 0, 5))).toBeGreaterThanOrEqual(0);
		expect(plane.distanceToPoint(new THREE.Vector3(0, 0, 15))).toBeLessThan(0);
		expect(m.side).toBe(THREE.DoubleSide);
	});

	it('has no clipping and one-sided faces without a cut', () => {
		scene.sync(design());
		expect(material('a').clippingPlanes ?? []).toHaveLength(0);
		expect(material('a').side).toBe(THREE.FrontSide);
	});

	it('shows nothing of X-ray while a picture of the design is taken, and then puts it back', () => {
		scene.setXray({ seeThrough: true, cut: { axis: 'z', at: 12 } });
		scene.sync(design());
		let during: [boolean, number, number] = [true, 0, 1];
		scene.withoutXray(() => {
			during = [material('a').transparent, material('a').opacity, material('a').clippingPlanes?.length ?? 0];
		});
		expect(during).toEqual([false, 1, 0]);
		expect(material('a').transparent).toBe(true);
		expect(material('a').clippingPlanes).toHaveLength(1);
	});

	it('does the same for a picture when X-ray is off: nothing changes', () => {
		scene.sync(design());
		scene.withoutXray(() => {});
		expect(material('a').transparent).toBe(false);
	});
});
