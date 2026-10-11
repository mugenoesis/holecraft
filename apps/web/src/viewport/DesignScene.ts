import { translationOf, type Design, type DesignNode, type NodeId, type ShapeType } from '@holecraft/core';
import * as THREE from 'three';

/** Unit-sized geometry resting on z=0, scaled per shape by its width/depth/height. */
function createUnitGeometry(type: ShapeType): THREE.BufferGeometry {
  switch (type) {
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    case 'cylinder':
      // three's cylinder runs along Y; stand it up along Z.
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 64).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 48, 32).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  }
}

/**
 * Mirrors a Design into three.js objects. `sync` is cheap to call after every change:
 * it updates existing meshes in place and only builds or discards what actually changed.
 */
export class DesignScene {
  readonly root = new THREE.Group();

  private readonly geometries = new Map<ShapeType, THREE.BufferGeometry>();
  private readonly meshes = new Map<NodeId, THREE.Mesh>();

  constructor() {
    this.root.name = 'design';
  }

  sync(design: Design): void {
    const live = new Set<NodeId>();

    for (const id of design.roots) {
      const node = design.nodes[id];
      if (!node || node.kind !== 'shape') continue;
      live.add(id);
      this.upsert(id, node);
    }

    for (const [id, mesh] of this.meshes) {
      if (live.has(id)) continue;
      this.root.remove(mesh);
      (mesh.material as THREE.Material).dispose();
      this.meshes.delete(id);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) (mesh.material as THREE.Material).dispose();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.meshes.clear();
    this.geometries.clear();
    this.root.clear();
  }

  private upsert(id: NodeId, node: Extract<DesignNode, { kind: 'shape' }>): void {
    let mesh = this.meshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(this.geometryFor(node.shapeType as ShapeType), new THREE.MeshStandardMaterial({ roughness: 0.55 }));
      mesh.userData.nodeId = id;
      this.meshes.set(id, mesh);
      this.root.add(mesh);
    }
    const { width, depth, height } = node.params as { width: number; depth: number; height: number };
    mesh.position.set(...translationOf(node.transform));
    mesh.scale.set(width, depth, height);
    (mesh.material as THREE.MeshStandardMaterial).color.set(node.color);
    mesh.visible = !node.hidden;
  }

  private geometryFor(type: ShapeType): THREE.BufferGeometry {
    let geometry = this.geometries.get(type);
    if (!geometry) {
      geometry = createUnitGeometry(type);
      this.geometries.set(type, geometry);
    }
    return geometry;
  }
}
