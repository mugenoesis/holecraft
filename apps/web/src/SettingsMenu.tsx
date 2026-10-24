import type { Design } from '@holecraft/core';
import { type Dispatch, useEffect, useRef, useState } from 'react';
import type { EditorAction } from './editorState.ts';
import { DEFAULT_HANDLE_SCALE, HANDLE_SCALE_STEP, MAX_HANDLE_SCALE, MIN_HANDLE_SCALE } from './handleScale.ts';
import { WorkplaneFields } from './WorkplaneFields.tsx';

interface Props {
	design: Design;
	dispatch: Dispatch<EditorAction>;
	handleScale: number;
	onHandleScale: (scale: number) => void;
}

/** What the cog opens: the handle size (kept in the browser) and the workplane's size (part of the design). */
export function SettingsPanel({ design, dispatch, handleScale, onHandleScale }: Props) {
	return (
		<div className="menu settings-panel">
			<label className="settings-row">
				<span>Handle size ({Math.round(handleScale * 100)}%)</span>
				<input
					type="range"
					aria-label="Handle size"
					min={MIN_HANDLE_SCALE}
					max={MAX_HANDLE_SCALE}
					step={HANDLE_SCALE_STEP}
					value={handleScale}
					onChange={(e) => onHandleScale(Number(e.target.value))}
				/>
			</label>
			<button
				type="button"
				className="settings-reset"
				onClick={() => onHandleScale(DEFAULT_HANDLE_SCALE)}
				disabled={handleScale === DEFAULT_HANDLE_SCALE}
			>
				Reset
			</button>
			<WorkplaneFields design={design} dispatch={dispatch} />
		</div>
	);
}

/** The cog beside the save status and its panel of settings. */
export function SettingsMenu(props: Props) {
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
		<div className="export-menu settings-menu" ref={root}>
			<button
				type="button"
				className="settings-button"
				aria-label="Settings"
				aria-expanded={open}
				title="Settings"
				onClick={() => setOpen((o) => !o)}
			>
				<span aria-hidden="true">⚙</span>
			</button>
			{open && <SettingsPanel {...props} />}
		</div>
	);
}
