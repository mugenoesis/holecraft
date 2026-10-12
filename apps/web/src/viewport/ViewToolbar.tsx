import type { ViewPresetName } from '@holecraft/core';
import type { RefObject } from 'react';
import type { Projection } from './CameraRig.ts';
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
	rulerOn: boolean;
	onToggleRuler: () => void;
}

export function ViewToolbar({ viewport, projection, rulerOn, onToggleRuler }: Props) {
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
			<button type="button" aria-pressed={rulerOn} aria-label="Ruler" title="Measure between two points (R)" onClick={onToggleRuler}>
				Ruler
			</button>
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
