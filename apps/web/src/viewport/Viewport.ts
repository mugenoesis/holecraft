import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWorkplane } from './workplane.ts';

export interface ViewportOptions {
  workplaneWidth: number;
  workplaneDepth: number;
}

/**
 * Imperative three.js engine. React only mounts it; per-frame work (camera,
 * gizmos, picking) stays here. The scene is Z-up, in millimetres, and only
 * re-renders on demand.
 */
export class Viewport {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;

  constructor(
    private readonly container: HTMLElement,
    opts: ViewportOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xe7ecf0);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 20000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(-170, -250, 210);

    // Placeholder controls; Phase 1 replaces these with holecraft's own camera scheme.
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.controls.addEventListener('change', this.requestRender);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-120, -200, 300);
    this.scene.add(sun);

    this.scene.add(createWorkplane(opts.workplaneWidth, opts.workplaneDepth));
    this.scene.add(createDemoBox());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  requestRender = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        const materials: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of materials) m.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }
}

/** Sample solid so the skeleton shows lighting and scale; removed once shapes exist. */
function createDemoBox(): THREE.Mesh {
  const size = 20;
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color: 0xe8743b, roughness: 0.55 }),
  );
  box.position.set(0, 0, size / 2);
  return box;
}
