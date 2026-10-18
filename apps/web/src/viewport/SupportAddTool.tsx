import type { NodeId, Vec3 } from '@holecraft/core';
import { useSurfaceTool } from './useSurfaceTool.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	/** A click on a shape: where on its surface, and which top-level object it is. */
	onAdd: (point: Vec3, id: NodeId) => void;
	/** Escape was pressed. */
	onClose: () => void;
}

/** While Add point is on, a click on a shape puts a support point on its surface (a click on the bare floor does nothing). Escape leaves it. */
export function SupportAddTool({ getViewport, onAdd, onClose }: Props) {
	useSurfaceTool(getViewport, {
		onClick: (hit) => {
			if (hit.id) onAdd(hit.point, hit.id);
		},
		onEscape: onClose,
	});
	return <div className="support-add-hint">Click the model to add a support point. Escape to stop.</div>;
}
