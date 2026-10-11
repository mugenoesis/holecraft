import * as THREE from 'three';

const PLANE_COLOR = 0xfafcfd;
const MINOR_COLOR = 0xdde5ec;
const MAJOR_COLOR = 0xa9bccb;
const EDGE_COLOR = 0x0f766e;

/** Workplane on the XY plane at Z=0: 1 mm minor lines, 10 mm major lines, centered on the origin. */
export function createWorkplane(width: number, depth: number, minor = 1, major = 10): THREE.Group {
	const group = new THREE.Group();
	group.name = 'workplane';

	const plane = new THREE.Mesh(
		new THREE.PlaneGeometry(width, depth),
		new THREE.MeshBasicMaterial({
			color: PLANE_COLOR,
			polygonOffset: true,
			polygonOffsetFactor: 1,
			polygonOffsetUnits: 1,
		}),
	);
	group.add(plane);

	const minorPts: number[] = [];
	const majorPts: number[] = [];
	const hw = width / 2;
	const hd = depth / 2;
	const ratio = Math.round(major / minor);

	// Lines are indexed from the origin so major lines always pass through it.
	for (let i = Math.ceil(-hw / minor); i <= Math.floor(hw / minor); i++) {
		const x = i * minor;
		if (Math.abs(Math.abs(x) - hw) < 1e-9) continue; // drawn by the border
		(i % ratio === 0 ? majorPts : minorPts).push(x, -hd, 0, x, hd, 0);
	}
	for (let j = Math.ceil(-hd / minor); j <= Math.floor(hd / minor); j++) {
		const y = j * minor;
		if (Math.abs(Math.abs(y) - hd) < 1e-9) continue;
		(j % ratio === 0 ? majorPts : minorPts).push(-hw, y, 0, hw, y, 0);
	}

	group.add(lines(minorPts, MINOR_COLOR));
	group.add(lines(majorPts, MAJOR_COLOR));
	group.add(lines([-hw, -hd, 0, hw, -hd, 0, hw, -hd, 0, hw, hd, 0, hw, hd, 0, -hw, hd, 0, -hw, hd, 0, -hw, -hd, 0], EDGE_COLOR));

	return group;
}

function lines(points: number[], color: number): THREE.LineSegments {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
	return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
}
