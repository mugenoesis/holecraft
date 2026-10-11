import {
  HOME_VIEW,
  applyViewPreset,
  designBounds,
  fitToBounds,
  rayPlaneIntersection,
  type Design,
  type OrbitState,
  type ViewPresetName,
} from '@holecraft/core';
import * as THREE from 'three';
import { CameraRig, FOV_DEG, type Projection } from './CameraRig.ts';
import { DesignScene } from './DesignScene.ts';
import { createWorkplane } from './workplane.ts';

export interface ViewportOptions {
  workplaneWidth: number;
  workplaneDepth: number;
  /** Called whenever the camera moves, including once at start-up. */
  onCameraChange: (state: OrbitState, projection: Projection) => void;
}

const WHEEL_RATE = 0.001;

/**
 * Imperative three.js engine. React only mounts it; per-frame work (camera, picking, and
 * later gizmos) stays here. The scene is Z-up, in millimetres, and renders on demand.
 *
 * Mouse: right-drag orbits, middle-drag or shift+right-drag pans, wheel zooms. The left
 * button is left free for selecting and moving shapes.
 */
export class Viewport {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig;
  private readonly designScene = new DesignScene();
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly canvas: HTMLCanvasElement;
  private design: Design | null = null;
  private frame = 0;
  private drag: { mode: 'orbit' | 'pan'; x: number; y: number } | null = null;

  constructor(
    private readonly host: HTMLElement,
    opts: ViewportOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    host.appendChild(this.canvas);

    this.scene.background = new THREE.Color(0xe7ecf0);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-120, -200, 300);
    this.scene.add(sun);
    this.scene.add(createWorkplane(opts.workplaneWidth, opts.workplaneDepth));
    this.scene.add(this.designScene.root);

    this.rig = new CameraRig((state, projection) => {
      opts.onCameraChange(state, projection);
      this.requestRender();
    });

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.rig.notify();
  }

  setDesign(design: Design): void {
    this.design = design;
    this.designScene.sync(design);
    this.requestRender();
  }

  home(): void {
    this.rig.goTo(HOME_VIEW);
    this.requestRender();
  }

  /** Frames everything in the design; with nothing to frame, returns to the home view. */
  fitAll(): void {
    const bounds = this.design && designBounds(this.design);
    if (!bounds) return this.home();
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    this.rig.goTo(fitToBounds(this.rig.state, bounds, FOV_DEG, aspect));
    this.requestRender();
  }

  setView(name: ViewPresetName): void {
    this.rig.goTo(applyViewPreset(this.rig.state, name));
    this.requestRender();
  }

  setProjection(projection: Projection): void {
    this.rig.setProjection(projection);
  }

  /** Workplane (x, y) in mm under a screen position, or null if it points at the sky. */
  pickWorkplane(clientX: number, clientY: number): [number, number] | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.rig.active);
    const { origin, direction } = this.raycaster.ray;
    const hit = rayPlaneIntersection([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z], 0);
    return hit ? [hit[0], hit[1]] : null;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.designScene.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        const materials: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of materials) m.dispose();
      }
    });
    this.renderer.dispose();
    this.canvas.remove();
  }

  private requestRender = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(this.tick);
  };

  private tick = (now: number): void => {
    this.frame = 0;
    this.rig.advance(now);
    this.renderer.render(this.scene, this.rig.active);
    if (this.rig.isAnimating) this.requestRender();
  };

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
  }

  private onPointerDown = (e: PointerEvent): void => {
    // Left button is reserved for selection; right orbits (shift pans), middle pans.
    const mode = e.button === 2 ? (e.shiftKey ? 'pan' : 'orbit') : e.button === 1 ? 'pan' : null;
    if (!mode) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { mode, x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    if (this.drag.mode === 'orbit') this.rig.orbitBy(dx, dy);
    else this.rig.panBy(dx, dy);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.drag) return;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.rig.zoomBy(Math.exp(e.deltaY * WHEEL_RATE));
  };

  private onContextMenu = (e: Event): void => e.preventDefault();
}
