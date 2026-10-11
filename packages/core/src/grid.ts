export interface GridSettings {
  /** Workplane width and depth in mm. */
  size: [number, number];
  /** Snap increment in mm; 0 disables snapping. */
  snap: number;
}

export const SNAP_STEPS_MM = [0, 0.1, 0.25, 0.5, 1, 2, 5, 10] as const;

export const DEFAULT_GRID: Readonly<GridSettings> = Object.freeze({
  size: [200, 200] as [number, number],
  snap: 1,
});

/** Keeps a workplane point inside the plane, which is centred on the origin. */
export function clampToWorkplane(point: [number, number], size: [number, number]): [number, number] {
  const limit = (half: number, v: number) => Math.min(half, Math.max(-half, v));
  return [limit(size[0] / 2, point[0]), limit(size[1] / 2, point[1])];
}

/** Rounds to the nearest multiple of `step`, trimming float noise (0.1 * 3 → 0.3). */
export function snapToGrid(value: number, step: number): number {
  if (step <= 0) return value;
  const snapped = Math.round(value / step) * step;
  return Math.round(snapped * 1e6) / 1e6;
}
