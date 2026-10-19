import { type Design, MAX_SUPPORT_RADIUS, type MeshData, MIN_SUPPORT_RADIUS, supportsStale } from '@holecraft/core';
import type { Dispatch } from 'react';
import type { EditorAction } from './editorState.ts';
import type { ResinPrinter } from './tridentApi.ts';
import { useDraft } from './useDraft.ts';
import type { SavedChoice } from './useSupports.ts';
import { pointsSummary, useSupports } from './useSupports.ts';
import type { SupportsUi } from './useSupportsUi.ts';

interface Props {
	design: Design;
	meshes: ReadonlyMap<string, MeshData>;
	dispatch: Dispatch<EditorAction>;
	ui: SupportsUi;
}

/** The printers: the user's saved ones first, then the catalogue, one group per maker. */
export function PrinterOptions({ printers, saved }: { printers: readonly ResinPrinter[]; saved: readonly SavedChoice[] }) {
	const vendors = [...new Set(printers.map((p) => p.vendor))];
	return (
		<>
			<option value="">Choose a printer…</option>
			{saved.length > 0 && (
				<optgroup label="Your saved printers">
					{saved.map((s) => (
						<option key={s.label} value={s.printer}>
							{s.label}
						</option>
					))}
				</optgroup>
			)}
			{vendors.map((vendor) => (
				<optgroup key={vendor} label={vendor || 'Other'}>
					{printers
						.filter((p) => p.vendor === vendor)
						.map((p) => (
							<option key={p.name} value={p.name}>
								{p.name}
							</option>
						))}
				</optgroup>
			))}
		</>
	);
}

/** The width of the chosen point's tip, typed in mm and kept when Enter is pressed or the box is left. */
function RadiusField({ design, ui, dispatch }: Pick<Props, 'design' | 'ui' | 'dispatch'>) {
	const point = design.supports?.points.find((p) => p.id === ui.selected);
	const draft = useDraft(point ? String(Math.round(point.radius * 1000) / 1000) : '', (typed) => {
		const radius = Number(typed);
		if (point && typed.trim() !== '' && Number.isFinite(radius)) dispatch({ type: 'supportRadius', id: point.id, radius });
	});
	return (
		<label className="resin-field">
			<span>Tip radius {point ? '' : '(choose a point)'}</span>
			<span className="resin-unit-field">
				<input
					type="number"
					inputMode="decimal"
					min={MIN_SUPPORT_RADIUS}
					max={MAX_SUPPORT_RADIUS}
					step="0.05"
					disabled={!point}
					aria-label="Tip radius"
					value={draft.value}
					onChange={(e) => draft.onChange(e.target.value)}
					onBlur={draft.onBlur}
					onKeyDown={draft.onKeyDown}
				/>
				<span aria-hidden="true">{design.units}</span>
			</span>
		</label>
	);
}

/** Editing the points once there are some: show them, add, delete, and start again. */
function PointControls({
	design,
	ui,
	dispatch,
	onAgain,
	busy,
}: Pick<Props, 'design' | 'ui' | 'dispatch'> & { onAgain: () => void; busy: boolean }) {
	return (
		<>
			<p className="resin-summary">
				<strong>{pointsSummary(design)}</strong>
			</p>
			<label className="resin-check">
				<input type="checkbox" checked={ui.show} onChange={(e) => ui.setShow(e.target.checked)} /> Show points
			</label>
			<RadiusField design={design} ui={ui} dispatch={dispatch} />
			<div className="resin-buttons">
				<button type="button" aria-pressed={ui.adding} onClick={ui.toggleAdding} title="Then click the model to put a point on its surface">
					Add point
				</button>
				<button
					type="button"
					disabled={!ui.selected}
					onClick={() => ui.selected && dispatch({ type: 'supportRemove', id: ui.selected })}
					title="Take the chosen point away (or press Delete)"
				>
					Delete point
				</button>
			</div>
			<div className="resin-buttons">
				<button type="button" onClick={() => dispatch({ type: 'supportsClear' })} title="Take every point away">
					Delete all
				</button>
				<button type="button" disabled={busy} onClick={onAgain} title="Throw away your changes and have Trident work the points out again">
					Back to generated
				</button>
			</div>
		</>
	);
}

/**
 * Support points for resin printing. Trident's slicer works out where the supports would touch the model; they show over it, can be moved,
 * added to and taken away, and are sent with the model so the print is supported at exactly those points.
 */
export function SupportsGroup({ design, meshes, dispatch, ui }: Props) {
	const s = useSupports(design, meshes, dispatch);
	const has = !!design.supports;
	return (
		<div className="resin-group" role="group" aria-label="Supports">
			<h3>Supports</h3>
			<label className="resin-field resin-wide-field">
				<span>Printer for the points</span>
				<select value={s.printer} onChange={(e) => s.setPrinter(e.target.value)}>
					<PrinterOptions printers={s.printers} saved={s.saved} />
				</select>
			</label>
			<button type="button" className="resin-wide" disabled={s.why !== null || s.busy} onClick={() => void s.generate()}>
				{s.busy ? 'Generating…' : 'Generate support points'}
			</button>
			{s.error && (
				<p className="export-problem" role="alert">
					{s.error}
				</p>
			)}
			<p className="muted hint">
				{s.why ??
					'Trident places them the way it will when it slices. Then add, move or remove points, and Send to Trident prints with exactly these.'}
			</p>
			{has && (
				<PointControls design={design} ui={ui} dispatch={dispatch} onAgain={() => void s.generate()} busy={s.busy || s.why !== null} />
			)}
			{supportsStale(design) && (
				<p className="resin-warning" role="status">
					The shape changed since the points were made. Generate them again, or they may no longer touch the model.
				</p>
			)}
			{has && <p className="muted hint">Click a point to choose it and drag it over the model to move it. Undo works for every change.</p>}
		</div>
	);
}
