import type { KeyboardEvent, PointerEvent } from 'react';
import { MAX_PANEL_WIDTH, MIN_PANEL_WIDTH, nudgedWidth, widthFromPointer } from './panelLayout.ts';

interface Props {
	compact: boolean;
	width: number;
	onWidth: (width: number) => void;
	onReset: () => void;
}

/** The edge between the 3D view and the desktop side panel: drag it, or focus it and use the arrow keys, to make the panel wider or narrower. */
export function PanelEdge({ compact, width, onWidth, onReset }: Props) {
	if (compact) return null;

	const drag = (e: PointerEvent<HTMLDivElement>) => {
		if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
		const workspace = e.currentTarget.parentElement?.getBoundingClientRect();
		onWidth(widthFromPointer(e.clientX, workspace?.right ?? window.innerWidth));
	};
	const key = (e: KeyboardEvent<HTMLDivElement>) => {
		const next = nudgedWidth(width, e.key, e.shiftKey);
		if (next === null) return;
		e.preventDefault();
		onWidth(next);
	};

	return (
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize the side panel"
			aria-valuenow={width}
			aria-valuemin={MIN_PANEL_WIDTH}
			aria-valuemax={MAX_PANEL_WIDTH}
			tabIndex={0}
			className="panel-edge"
			title="Drag to resize the side panel (double click for the usual width)"
			onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
			onPointerMove={drag}
			onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
			onDoubleClick={onReset}
			onKeyDown={key}
		/>
	);
}
