import { type Design, nudgeDirections, type OrbitState } from '@holecraft/core';
import { type RefObject, useEffect } from 'react';
import { isTypingTarget } from '../keyboard.ts';
import type { SurfaceTool } from './surfaceTool.ts';
import type { Viewport } from './Viewport.ts';

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
	ArrowRight: [1, 0],
	ArrowLeft: [-1, 0],
	ArrowUp: [0, 1],
	ArrowDown: [0, -1],
};

/**
 * How far an arrow key moves the selection on the workplane, in mm, or null for any other key. An arrow
 * moves along the world axis closest to its on-screen direction; one snap step, or ten with Shift.
 */
export function nudgeForKey(key: string, shift: boolean, snap: number, azimuth: number): [number, number] | null {
	const arrow = Object.hasOwn(ARROWS, key) ? ARROWS[key] : undefined;
	if (!arrow) return null;
	const step = (snap || 1) * (shift ? 10 : 1);
	const dirs = nudgeDirections(azimuth);
	const along = arrow[1] !== 0 ? dirs.up : dirs.right;
	const sign = arrow[0] + arrow[1];
	return [along[0] * sign * step, along[1] * sign * step];
}

interface Targets {
	viewport: RefObject<Viewport | null>;
	camera: RefObject<{ state: OrbitState }>;
	/** The latest design and nudge handler (read at the time of the key press). */
	latest: RefObject<{ design: Design; onNudge: (delta: [number, number]) => void }>;
	/** R, W, E and N: turn the ruler, the Workplane tool, the Edge tool or the Paint tool on or off. */
	onToggleTool: (tool: SurfaceTool) => void;
}

/** The view commands on a plain key, by lower-case key name. */
function viewCommand(key: string, viewport: Viewport | null, onToggleTool: (tool: SurfaceTool) => void): (() => void) | undefined {
	const commands: Record<string, () => void> = {
		home: () => viewport?.home(),
		f: () => viewport?.fitAll(),
		r: () => onToggleTool('ruler'),
		w: () => onToggleTool('workplane'),
		e: () => onToggleTool('edges'),
		n: () => onToggleTool('paint'),
	};
	return Object.hasOwn(commands, key.toLowerCase()) ? commands[key.toLowerCase()] : undefined;
}

/** Arrow keys nudge the selection; Home resets the view, F frames everything, R/W/E are the ruler, Workplane and Edge tools. Ignored while typing. */
export function useViewKeys({ viewport, camera, latest, onToggleTool }: Targets): void {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
			const nudge = nudgeForKey(e.key, e.shiftKey, latest.current.design.grid.snap, camera.current.state.azimuth);
			const run = nudge ? () => latest.current.onNudge(nudge) : viewCommand(e.key, viewport.current, onToggleTool);
			if (!run) return;
			run();
			e.preventDefault();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [viewport, camera, latest, onToggleTool]);
}
