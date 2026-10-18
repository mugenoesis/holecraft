import { SupportAddTool } from './SupportAddTool.tsx';
import { SupportMarkers } from './SupportMarkers.tsx';
import type { SupportsView } from './supportsView.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	supports: SupportsView | undefined;
	/** False while another tool owns the view (the markers would catch its clicks). */
	active: boolean;
	getViewport: () => Viewport | null;
	camera: unknown;
}

/** The support points over the view (when shown and there are some), and the tool that adds one while Add point is on. */
export function SupportsLayer({ supports, active, getViewport, camera }: Props) {
	if (!supports || !active) return null;
	return (
		<>
			{supports.show && supports.points.length > 0 && (
				<SupportMarkers
					points={supports.points}
					selected={supports.selected}
					getViewport={getViewport}
					camera={camera}
					onSelect={supports.onSelect}
					onDragStart={supports.onDragStart}
					onMove={supports.onMove}
					onDragEnd={supports.onDragEnd}
					onRemove={supports.onRemove}
				/>
			)}
			{supports.adding && <SupportAddTool getViewport={getViewport} onAdd={supports.onAdd} onClose={supports.onStopAdding} />}
		</>
	);
}
