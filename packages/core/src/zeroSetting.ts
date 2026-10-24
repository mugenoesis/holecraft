import type { Design } from './design.ts';
import type { ZeroPoint, ZeroTurns } from './zeroPoint.ts';

/** Sets the design's zero point (floor spot in mm and the L's quarter turns). The same design comes back for no change or a non-finite spot. */
export function setZeroPoint(design: Design, at: ZeroPoint, turns: ZeroTurns, now?: Date): Design {
	if (!Number.isFinite(at[0]) || !Number.isFinite(at[1])) return design;
	const old = design.zero;
	if (old && old.x === at[0] && old.y === at[1] && old.turns === turns) return design;
	return { ...design, zero: { x: at[0], y: at[1], turns }, updatedAt: (now ?? new Date()).toISOString() };
}

/** The design without a zero point; the same design when it has none. */
export function clearZeroPoint(design: Design, now?: Date): Design {
	if (!design.zero) return design;
	const { zero: _zero, ...rest } = design;
	return { ...rest, updatedAt: (now ?? new Date()).toISOString() };
}
