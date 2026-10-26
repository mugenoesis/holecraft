import * as THREE from 'three';

const COLOR = 0xe8a317;
const OPACITY = 0.25;
const OPACITY_SELECTED = 0.7;

/** A closed cavity as the view draws it: its number and the solid that fills it, in the world. */
export interface CavityShape {
	id: number;
	fill: { positions: Float32Array; indices: Uint32Array };
}

/** The cavities as translucent amber volumes, the chosen one stronger. Not part of the design. */
export function createCavityMarkers(cavities: readonly CavityShape[], selected: number | null): THREE.Group {
	const group = new THREE.Group();
	group.name = 'cavity-markers';
	for (const cavity of cavities) {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(cavity.fill.positions, 3));
		geometry.setIndex(new THREE.BufferAttribute(cavity.fill.indices, 1));
		const mesh = new THREE.Mesh(
			geometry,
			new THREE.MeshBasicMaterial({
				color: COLOR,
				transparent: true,
				opacity: cavity.id === selected ? OPACITY_SELECTED : OPACITY,
				side: THREE.DoubleSide,
				depthWrite: false,
			}),
		);
		mesh.userData.cavityId = cavity.id;
		mesh.renderOrder = 2;
		group.add(mesh);
	}
	return group;
}

/** The number of the cavity a ray passes through nearest to its start, or null. */
export function pickCavity(markers: THREE.Group, raycaster: THREE.Raycaster): number | null {
	const hit = raycaster.intersectObjects(markers.children, false)[0];
	return hit ? (hit.object.userData.cavityId as number) : null;
}
