import type { NodeId, SupportPoint, Vec3 } from '@holecraft/core';

/** What the view needs to show and edit the design's support points (the controls are in the Resin panel). */
export interface SupportsView {
	points: readonly SupportPoint[];
	selected: string | null;
	/** Whether the points are drawn at all. */
	show: boolean;
	/** Whether a click on a shape adds a point. */
	adding: boolean;
	onSelect: (id: string) => void;
	onDragStart: () => void;
	onMove: (id: string, to: Vec3) => void;
	onDragEnd: () => void;
	onRemove: (id: string) => void;
	/** A click on a shape while adding: a point on its surface, and the top-level object it is on. */
	onAdd: (point: Vec3, id: NodeId) => void;
	onStopAdding: () => void;
}
