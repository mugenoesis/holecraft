import type { Design } from './design.ts';

/** The smallest and biggest the workplane (the build plate) may be on a side, in mm: 100 cm is as big as a plate needs to be. */
export const MIN_WORKPLANE_MM = 10;
export const MAX_WORKPLANE_MM = 1000;

/** A side of the workplane as typed, brought within the limits and rounded to a hundredth of a mm. Null if it is not a number. */
export function limitWorkplane(mm: number): number | null {
	if (Number.isNaN(mm)) return null;
	const limited = Math.min(MAX_WORKPLANE_MM, Math.max(MIN_WORKPLANE_MM, mm));
	return Math.round(limited * 100) / 100;
}

/**
 * The design with a workplane of this width and depth (mm, each brought within the limits). Shapes outside a smaller plate stay where they are.
 * The same design comes back when nothing changes or a size is not a number.
 */
export function setWorkplaneSize(design: Design, width: number, depth: number, now?: Date): Design {
	const w = limitWorkplane(width);
	const d = limitWorkplane(depth);
	if (w === null || d === null) return design;
	const [oldWidth, oldDepth] = design.grid.size;
	if (w === oldWidth && d === oldDepth) return design;
	return { ...design, grid: { ...design.grid, size: [w, d] }, updatedAt: (now ?? new Date()).toISOString() };
}

/** The spacing of the lines drawn on the workplane: every mm and every 10 mm, or (on a plate bigger than 400 mm) every 10 mm and every 100 mm. */
export function workplaneSpacing(size: readonly [number, number]): { minor: number; major: number } {
	return Math.max(size[0], size[1]) > 400 ? { minor: 10, major: 100 } : { minor: 1, major: 10 };
}
