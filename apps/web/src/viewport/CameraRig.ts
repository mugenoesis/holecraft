import {
  HOME_VIEW,
  cameraPosition,
  orbit,
  pan,
  zoom,
  type OrbitState,
} from '@holecraft/core';
import * as THREE from 'three';

export type Projection = 'perspective' | 'orthographic';

export const FOV_DEG = 40;

/** Radians of orbit per pixel dragged. */
const ORBIT_RATE = 0.005;
const ANIMATION_MS = 220;

interface Animation {
  from: OrbitState;
  to: OrbitState;
  /** Set on the first `advance` so the clock origin is the renderer's, not ours. */
  start: number | null;
}

const copy = (s: OrbitState): OrbitState => ({ ...s, target: [...s.target] });
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
/** Wraps an angle difference into (-π, π]. */
const shortestAngle = (d: number) => ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/**
 * Owns the orbit state and the two three.js cameras (perspective and orthographic) that
 * are kept in sync with it. No DOM and no rendering, so it can be unit-tested.
 */
export class CameraRig {
  readonly perspective = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.5, 20000);
  readonly orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20000);

  private _state: OrbitState = copy(HOME_VIEW);
  private _projection: Projection = 'perspective';
  private width = 1;
  private height = 1;
  private animation: Animation | null = null;

  constructor(private readonly onChange: (state: OrbitState, projection: Projection) => void) {
    this.perspective.up.set(0, 0, 1);
    this.orthographic.up.set(0, 0, 1);
    this.updateCameras();
  }

  get state(): OrbitState {
    return this._state;
  }

  get projection(): Projection {
    return this._projection;
  }

  get active(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this._projection === 'perspective' ? this.perspective : this.orthographic;
  }

  get isAnimating(): boolean {
    return this.animation !== null;
  }

  /** Reports the current state to the listener, e.g. once at start-up. */
  notify(): void {
    this.onChange(this._state, this._projection);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.perspective.aspect = this.width / this.height;
    this.updateCameras();
    this.notify();
  }

  orbitBy(dxPx: number, dyPx: number): void {
    this.set(orbit(this._state, -dxPx * ORBIT_RATE, -dyPx * ORBIT_RATE));
  }

  panBy(dxPx: number, dyPx: number): void {
    this.set(pan(this._state, dxPx, dyPx, this.height, FOV_DEG));
  }

  zoomBy(factor: number): void {
    this.set(zoom(this._state, factor));
  }

  setProjection(projection: Projection): void {
    this._projection = projection;
    this.updateCameras();
    this.notify();
  }

  /** Moves to `state`, easing there unless told otherwise. */
  goTo(state: OrbitState, { animate = true }: { animate?: boolean } = {}): void {
    if (!animate) {
      this.set(copy(state));
      return;
    }
    this.animation = { from: this._state, to: copy(state), start: null };
  }

  /** Steps the animation to time `now` (ms). Returns true while more frames are needed. */
  advance(now: number): boolean {
    const anim = this.animation;
    if (!anim) return false;
    anim.start ??= now;
    const t = (now - anim.start) / ANIMATION_MS;
    if (t >= 1) {
      this.animation = null;
      this.commit(copy(anim.to));
      return false;
    }
    const e = easeOutCubic(Math.max(0, t));
    const { from, to } = anim;
    this.commit({
      target: [0, 1, 2].map((k) => from.target[k]! + (to.target[k]! - from.target[k]!) * e) as OrbitState['target'],
      azimuth: from.azimuth + shortestAngle(to.azimuth - from.azimuth) * e,
      polar: from.polar + (to.polar - from.polar) * e,
      distance: from.distance + (to.distance - from.distance) * e,
    });
    return true;
  }

  /** User input wins over any animation in flight. */
  private set(state: OrbitState): void {
    this.animation = null;
    this.commit(state);
  }

  private commit(state: OrbitState): void {
    this._state = state;
    this.updateCameras();
    this.notify();
  }

  private updateCameras(): void {
    const s = this._state;
    const [px, py, pz] = cameraPosition(s);
    const halfHeight = s.distance * Math.tan((FOV_DEG * Math.PI) / 360);
    const halfWidth = halfHeight * (this.width / this.height);

    this.orthographic.left = -halfWidth;
    this.orthographic.right = halfWidth;
    this.orthographic.top = halfHeight;
    this.orthographic.bottom = -halfHeight;

    for (const cam of [this.perspective, this.orthographic]) {
      cam.position.set(px, py, pz);
      cam.lookAt(s.target[0], s.target[1], s.target[2]);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    }
  }
}
