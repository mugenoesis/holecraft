import type { OrbitState, SketchFrame } from '@holecraft/core';
import { useEffect, useRef } from 'react';
import type { Projection } from './CameraRig.ts';
import type { Viewport } from './Viewport.ts';

/**
 * Makes the view look straight at a plane (a sketch's, or the surface lettering is placed on), faded and still, while a tool works there, and puts
 * the camera back as it was when the tool goes. `size` is how much of the plane to frame.
 */
export function usePlaneView(
	getViewport: () => Viewport | null,
	frame: SketchFrame,
	size: number,
	camera: { state: OrbitState; projection: Projection },
) {
	const before = useRef(camera);
	useEffect(() => {
		const viewport = getViewport();
		if (!viewport) return;
		const was = before.current;
		viewport.setSurfaceTool(true, true);
		viewport.setDimmed(true);
		viewport.lookAtPlane({ origin: frame.origin, normal: frame.normal }, size);
		return () => {
			viewport.setSurfaceTool(false);
			viewport.setDimmed(false);
			viewport.goToView(was.state, was.projection);
		};
	}, [getViewport, frame, size]);
}
