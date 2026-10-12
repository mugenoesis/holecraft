import { isUsablePlane, type WorkPlane } from '@holecraft/core';
import { useState } from 'react';
import { useSurfaceTool } from './useSurfaceTool.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	/** The chosen plane, or null when the floor was clicked (back to the normal workplane). */
	onPlane: (plane: WorkPlane | null) => void;
	onClose: () => void;
}

/** True for the bare floor: a point at z = 0 on a face pointing straight up. */
const isFloor = (point: readonly number[], normal: readonly number[]) => Math.abs(point[2]!) < 1e-6 && normal[2]! > 0.99;

/**
 * The Workplane tool: click a face of a shape to build on it (new shapes then stand on that face), or click the floor
 * to go back to the normal workplane. Undersides can't be built on. Escape cancels. The plane is not saved.
 */
export function WorkplaneTool({ getViewport, onPlane, onClose }: Props) {
	const [problem, setProblem] = useState<string | null>(null);

	useSurfaceTool(getViewport, {
		onClick: ({ point, normal }) => {
			if (isFloor(point, normal)) {
				onPlane(null);
				onClose();
			} else if (isUsablePlane(normal)) {
				onPlane({ origin: [round(point[0]), round(point[1]), round(point[2])], normal });
				onClose();
			} else {
				setProblem('That face points down, so nothing can stand on it');
			}
		},
		onEscape: onClose,
	});

	return (
		<div className="ruler-readout" data-testid="workplane-hint" role="status">
			<span>{problem ?? 'Click a face to build on it, or the floor to go back'}</span>
		</div>
	);
}

const round = (v: number) => Math.round(v * 100) / 100 + 0;
