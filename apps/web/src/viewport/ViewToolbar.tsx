import type { ViewPresetName } from '@holecraft/core';
import { type RefObject, useEffect, useRef, useState } from 'react';
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
	/** The compact layout: the tools go in a menu. */
	compact: boolean;
}

/** A button that is on or off. */
interface Toggle {
	label: string;
	title: string;
	pressed: boolean;
	onClick: () => void;
}

/** The surface tools and the less used view switches: on a desktop each is a button, in the compact layout they share a menu. */
function toggles(p: Props): Toggle[] {
	const tool = (t: SurfaceTool, label: string, title: string): Toggle => ({
		label,
		title,
		pressed: p.tool === t,
		onClick: () => p.onToggleTool(t),
	});
	const list: Toggle[] = [
		tool('ruler', 'Ruler', 'Measure between two points (R)'),
		tool('workplane', 'Workplane', 'Build on a face: click a face to put new shapes on it (W)'),
		tool('edges', 'Edges', 'Chamfer or round edges of the selected shape (E)'),
		tool('paint', 'Paint', "Paint faces in the design's filament colours: click a face (N)"),
		tool('sketch', 'Sketch', 'Draw a 2D sketch on the floor or a chosen face, then extrude it into a shape (K)'),
	];
	if (p.hasThreads)
		list.push({
			label: 'Simple threads',
			title: 'Draw threads as plain cylinders while you edit, which is much quicker for long ones. Exports always have the real thread',
			pressed: p.simpleThreads,
			onClick: p.onToggleSimpleThreads,
		});
	return list;
}

function ToggleButton({ toggle, text }: { toggle: Toggle; text?: string }) {
	return (
		<button type="button" aria-pressed={toggle.pressed} aria-label={toggle.label} title={toggle.title} onClick={toggle.onClick}>
			{text ?? toggle.label}
		</button>
	);
}

/** The compact layout's "Tools" menu: the surface tools and view switches, one tap away without crowding the view. */
function ToolsMenu({ items }: { items: Toggle[] }) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
		const onPointer = (e: PointerEvent) => {
			if (!root.current?.contains(e.target as Node)) setOpen(false);
		};
		window.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', onPointer);
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('pointerdown', onPointer);
		};
	}, [open]);

	return (
		<div className="tools-menu" ref={root}>
			<button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
				Tools ▾
			</button>
			{open && (
				<div className="menu" role="menu" aria-label="Tools">
					{items.map((t) => (
						<button
							key={t.label}
							type="button"
							role="menuitemcheckbox"
							aria-checked={t.pressed}
							title={t.title}
							onClick={() => {
								setOpen(false);
								t.onClick();
							}}
						>
							<span aria-hidden="true">{t.pressed ? '✓' : ''}</span>
							{t.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export function ViewToolbar(props: Props) {
	const { viewport, projection, multiSelect, onToggleMultiSelect, planeActive, onResetPlane, compact } = props;
	const ortho: Toggle = {
		label: 'Orthographic',
		title: 'Toggle orthographic projection',
		pressed: projection === 'orthographic',
		onClick: () => viewport.current?.setProjection(projection === 'orthographic' ? 'perspective' : 'orthographic'),
	};
	const select: Toggle = {
		label: 'Select',
		title:
			'Select several: while on, every tap adds an object to (or takes it from) the selection, and dragging on empty space draws a selection box. For a touch screen, which has no Shift key',
		pressed: multiSelect,
		onClick: onToggleMultiSelect,
	};
	const rest = toggles(props);
	// The tool in use stays on the bar in the compact layout, so one tap puts it away (a touch screen has no Escape).
	const active = rest.find((t) => t.pressed && t.label !== 'Simple threads');

	return (
		<div className="viewport-toolbar" role="toolbar" aria-label="View controls">
			<button type="button" onClick={() => viewport.current?.home()} aria-label="Home view" title="Home view (Home)">
				Home
			</button>
			<button type="button" onClick={() => viewport.current?.fitAll()} aria-label="Fit all" title="Fit all (F)">
				Fit
			</button>
			{!compact && <ToggleButton toggle={ortho} text="Ortho" />}
			<ToggleButton toggle={select} />
			{compact ? (
				<>
					{active && <ToggleButton toggle={active} text={`${active.label} ✕`} />}
					<ToolsMenu items={[...rest, ortho]} />
				</>
			) : (
				rest.map((t) => <ToggleButton key={t.label} toggle={t} />)
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
