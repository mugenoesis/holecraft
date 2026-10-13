import type { ViewPresetName } from '@holecraft/core';
import type { RefObject } from 'react';
import type { Projection } from './CameraRig.ts';
import type { SurfaceTool } from './surfaceTool.ts';
import type { Viewport } from './Viewport.ts';

const VIEW_OPTIONS: ReadonlyArray<{ value: ViewPresetName; label: string }> = [
	{ value: 'iso', label: 'Isometric' },
	{ value: 'front', label: 'Front' },
	{ value: 'back', label: 'Back' },
	{ value: 'left', label: 'Left' },
	{ value: 'right', label: 'Right' },
	{ value: 'top', label: 'Top' },
	{ value: 'bottom', label: 'Bottom' },
];

/** Home, fit, orthographic toggle and the standard views, floating in the corner of the 3D view. */
interface Props {
	viewport: RefObject<Viewport | null>;
	projection: Projection;
	tool: SurfaceTool | null;
	/** The Select toggle: every tap adds to the selection, and a finger on empty space draws the selection box. */
	multiSelect: boolean;
	onToggleMultiSelect: () => void;
	onToggleTool: (tool: SurfaceTool) => void;
	/** True while a Workplane-tool plane is in use, which adds a way back to the floor. */
	planeActive: boolean;
	onResetPlane: () => void;
	/** Offered only when the design has a thread: draw threads as plain cylinders while editing (the export is always the real thread). */
	hasThreads: boolean;
	simpleThreads: boolean;
	onToggleSimpleThreads: () => void;
}

export function ViewToolbar({
	viewport,
	projection,
	tool,
	multiSelect,
	onToggleMultiSelect,
	onToggleTool,
	planeActive,
	onResetPlane,
	hasThreads,
	simpleThreads,
	onToggleSimpleThreads,
}: Props) {
	return (
		<div className="viewport-toolbar" role="toolbar" aria-label="View controls">
			<button type="button" onClick={() => viewport.current?.home()} aria-label="Home view" title="Home view (Home)">
				Home
			</button>
			<button type="button" onClick={() => viewport.current?.fitAll()} aria-label="Fit all" title="Fit all (F)">
				Fit
			</button>
			<button
				type="button"
				aria-pressed={projection === 'orthographic'}
				aria-label="Orthographic"
				title="Toggle orthographic projection"
				onClick={() => viewport.current?.setProjection(projection === 'orthographic' ? 'perspective' : 'orthographic')}
			>
				Ortho
			</button>
			<button
				type="button"
				aria-pressed={multiSelect}
				aria-label="Select"
				title="Select several: while on, every tap adds an object to (or takes it from) the selection, and dragging on empty space draws a selection box. For a touch screen, which has no Shift key"
				onClick={onToggleMultiSelect}
			>
				Select
			</button>
			<button
				type="button"
				aria-pressed={tool === 'ruler'}
				aria-label="Ruler"
				title="Measure between two points (R)"
				onClick={() => onToggleTool('ruler')}
			>
				Ruler
			</button>
			<button
				type="button"
				aria-pressed={tool === 'workplane'}
				aria-label="Workplane"
				title="Build on a face: click a face to put new shapes on it (W)"
				onClick={() => onToggleTool('workplane')}
			>
				Workplane
			</button>
			<button
				type="button"
				aria-pressed={tool === 'edges'}
				aria-label="Edges"
				title="Chamfer or round edges of the selected shape (E)"
				onClick={() => onToggleTool('edges')}
			>
				Edges
			</button>
			<button
				type="button"
				aria-pressed={tool === 'paint'}
				aria-label="Paint"
				title="Paint faces in the design's filament colours: click a face (N)"
				onClick={() => onToggleTool('paint')}
			>
				Paint
			</button>
			<button
				type="button"
				aria-pressed={tool === 'sketch'}
				aria-label="Sketch"
				title="Draw a 2D sketch on the floor or a chosen face, then extrude it into a shape (K)"
				onClick={() => onToggleTool('sketch')}
			>
				Sketch
			</button>
			{hasThreads && (
				<button
					type="button"
					aria-pressed={simpleThreads}
					aria-label="Simple threads"
					title="Draw threads as plain cylinders while you edit, which is much quicker for long ones. Exports always have the real thread"
					onClick={onToggleSimpleThreads}
				>
					Simple threads
				</button>
			)}
			{planeActive && (
				<button type="button" aria-label="Back to the floor" title="Put new shapes on the floor again" onClick={onResetPlane}>
					Floor
				</button>
			)}
			<select
				aria-label="Standard views"
				value=""
				onChange={(e) => {
					if (e.target.value) viewport.current?.setView(e.target.value as ViewPresetName);
				}}
			>
				<option value="">View…</option>
				{VIEW_OPTIONS.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</div>
	);
}
