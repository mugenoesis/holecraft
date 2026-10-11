/**
 * Orbit-camera maths for a Z-up scene, independent of any renderer.
 *
 * Azimuth 0 puts the camera in front of the scene (at -Y) looking along +Y;
 * increasing azimuth swings it towards +X. Polar 0 is straight above, π/2 is
 * level with the workplane.
 */
export type Vec3 = [number, number, number];

export interface OrbitState {
  target: Vec3;
  /** Radians around the Z axis. */
  azimuth: number;
  /** Radians down from straight above, kept just inside (0, π) so the view never flips. */
  polar: number;
  /** Distance from the target in mm. */
  distance: number;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export const MIN_POLAR = 0.001;
export const MAX_POLAR = Math.PI - 0.001;
export const MIN_DISTANCE = 5;
export const MAX_DISTANCE = 5000;

export const HOME_VIEW: Readonly<OrbitState> = Object.freeze({
  target: [0, 0, 0] as Vec3,
  azimuth: -0.6,
  polar: 1.0,
  distance: 330,
});

export type ViewPresetName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso';

export const VIEW_PRESETS: Readonly<Record<ViewPresetName, { azimuth: number; polar: number }>> = {
  front: { azimuth: 0, polar: Math.PI / 2 },
  back: { azimuth: Math.PI, polar: Math.PI / 2 },
  right: { azimuth: Math.PI / 2, polar: Math.PI / 2 },
  left: { azimuth: -Math.PI / 2, polar: Math.PI / 2 },
  top: { azimuth: 0, polar: MIN_POLAR },
  bottom: { azimuth: 0, polar: MAX_POLAR },
  iso: { azimuth: -Math.PI / 4, polar: Math.acos(1 / Math.sqrt(3)) },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Unit vector from the target towards the camera. */
function backVector(s: OrbitState): Vec3 {
  const sp = Math.sin(s.polar);
  return [sp * Math.sin(s.azimuth), -sp * Math.cos(s.azimuth), Math.cos(s.polar)];
}

export function cameraPosition(s: OrbitState): Vec3 {
  const [bx, by, bz] = backVector(s);
  return [s.target[0] + s.distance * bx, s.target[1] + s.distance * by, s.target[2] + s.distance * bz];
}

export function orbit(s: OrbitState, dAzimuth: number, dPolar: number): OrbitState {
  return { ...s, target: [...s.target], azimuth: s.azimuth + dAzimuth, polar: clamp(s.polar + dPolar, MIN_POLAR, MAX_POLAR) };
}

export function zoom(s: OrbitState, factor: number): OrbitState {
  return { ...s, target: [...s.target], distance: clamp(s.distance * factor, MIN_DISTANCE, MAX_DISTANCE) };
}

/**
 * World→camera rotation as three row vectors (right, up, back), row-major.
 * The right vector is analytic, so it stays defined looking straight up or down.
 */
export function viewRotation(s: OrbitState): number[] {
  const right: Vec3 = [Math.cos(s.azimuth), Math.sin(s.azimuth), 0];
  const back = backVector(s);
  const up: Vec3 = [
    back[1] * right[2] - back[2] * right[1],
    back[2] * right[0] - back[0] * right[2],
    back[0] * right[1] - back[1] * right[0],
  ];
  return [...right, ...up, ...back];
}

/** Drag-to-pan: the scene follows the pointer, so the target moves the opposite way. */
export function pan(s: OrbitState, dxPx: number, dyPx: number, viewportHeightPx: number, fovDeg: number): OrbitState {
  const worldPerPx = (2 * s.distance * Math.tan((fovDeg * Math.PI) / 360)) / viewportHeightPx;
  const r = viewRotation(s);
  const target: Vec3 = [0, 1, 2].map((k) => s.target[k]! - r[k]! * dxPx * worldPerPx + r[3 + k]! * dyPx * worldPerPx) as Vec3;
  return { ...s, target };
}

/** Distance at which a sphere of `radius` fits in both the vertical and horizontal field of view. */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  return radius / Math.sin(Math.min(vHalf, hHalf));
}

const FIT_MARGIN = 1.15;

export function fitToBounds(s: OrbitState, bounds: Bounds, fovDeg: number, aspect: number): OrbitState {
  const center = [0, 1, 2].map((k) => (bounds.min[k]! + bounds.max[k]!) / 2) as Vec3;
  const radius = Math.hypot(...([0, 1, 2].map((k) => (bounds.max[k]! - bounds.min[k]!) / 2) as Vec3));
  return {
    ...s,
    target: center,
    distance: clamp(fitDistance(radius * FIT_MARGIN, fovDeg, aspect), MIN_DISTANCE, MAX_DISTANCE),
  };
}

export function applyViewPreset(s: OrbitState, name: ViewPresetName): OrbitState {
  const { azimuth, polar } = VIEW_PRESETS[name];
  return { ...s, target: [...s.target], azimuth, polar };
}
