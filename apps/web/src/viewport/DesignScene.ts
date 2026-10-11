import { translationOf, type Design, type DesignNode, type NodeId, type ShapeType } from '@holecraft/core';
import * as THREE from 'three';

const SELECTED_TINT = 0x1f6f8b;
const OUTLINE_COLOR = 0x0f766e;

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

/** Screen-space rectangle in normalised device coordinates (-1..1, Y up). */
export interface NdcRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Corners of the unit bounding box shared by every shape (x, y in ±0.5, z in 0..1). */
const UNIT_CORNERS = [-0.5, 0.5].flatMap((x) => [-0.5, 0.5].flatMap((y) => [0, 1].map((z) => new THREE.Vector3(x, y, z))));

/**
 * Mirrors a Design into three.js objects. `sync` is cheap to call after every change:
 * it updates existing meshes in place and only builds or discards what actually changed.
 */
export class DesignScene {
  readonly root = new THREE.Group();

  private readonly geometries = new Map<ShapeType, THREE.BufferGeometry>();
  private readonly meshes = new Map<NodeId, THREE.Mesh>();
  private readonly outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5));
  private selection = new Set<NodeId>();

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
      this.disposeMesh(mesh);
      this.meshes.delete(id);
    }
  }

  setSelection(ids: readonly NodeId[]): void {
    this.selection = new Set(ids);
    for (const [id, mesh] of this.meshes) this.applySelection(id, mesh);
  }

  /** The shape nearest to the ray's origin that it hits, or null. */
  pick(raycaster: THREE.Raycaster): NodeId | null {
    this.root.updateMatrixWorld(true);
    const candidates = [...this.meshes.values()].filter((m) => m.visible);
    const [hit] = raycaster.intersectObjects(candidates, false);
    return hit ? (hit.object.userData.nodeId as NodeId) : null;
  }

  /** Visible shapes whose on-screen bounding box overlaps `rect` (marquee selection). */
  idsInRect(camera: THREE.Camera, rect: NdcRect): NodeId[] {
    this.root.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const ids: NodeId[] = [];
    const p = new THREE.Vector3();
    for (const [id, mesh] of this.meshes) {
      if (!mesh.visible) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const corner of UNIT_CORNERS) {
        p.copy(corner).applyMatrix4(mesh.matrixWorld).project(camera);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      if (maxX >= rect.minX && minX <= rect.maxX && maxY >= rect.minY && minY <= rect.maxY) ids.push(id);
    }
    return ids;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) this.disposeMesh(mesh);
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.outlineGeometry.dispose();
    this.meshes.clear();
    this.geometries.clear();
    this.root.clear();
  }

  private upsert(id: NodeId, node: Extract<DesignNode, { kind: 'shape' }>): void {
    let mesh = this.meshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(this.geometryFor(node.shapeType as ShapeType), new THREE.MeshStandardMaterial({ roughness: 0.55 }));
      mesh.userData.nodeId = id;
      const outline = new THREE.LineSegments(this.outlineGeometry, new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }));
      outline.name = 'selection-outline';
      mesh.add(outline);
      this.meshes.set(id, mesh);
      this.root.add(mesh);
      this.applySelection(id, mesh);
    }
    const { width, depth, height } = node.params as { width: number; depth: number; height: number };
    mesh.position.set(...translationOf(node.transform));
    mesh.scale.set(width, depth, height);
    (mesh.material as THREE.MeshStandardMaterial).color.set(node.color);
    mesh.visible = !node.hidden;
  }

  private applySelection(id: NodeId, mesh: THREE.Mesh): void {
    const selected = this.selection.has(id);
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.emissive.set(selected ? SELECTED_TINT : 0x000000);
    material.emissiveIntensity = selected ? 0.35 : 1;
    const outline = mesh.getObjectByName('selection-outline');
    if (outline) outline.visible = selected;
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    (mesh.material as THREE.Material).dispose();
    mesh.getObjectByName('selection-outline')?.traverse((o) => {
      if (o instanceof THREE.LineSegments) (o.material as THREE.Material).dispose();
    });
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
