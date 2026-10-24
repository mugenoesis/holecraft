import { useEffect, useRef, useState } from 'react';
import { HANDLE_SCALE_STEP, MAX_HANDLE_SCALE, MIN_HANDLE_SCALE } from './handleScale.ts';

/** The cog beside the save status and its panel of personal settings (kept in the browser, not in the design). */
export function SettingsMenu({ handleScale, onHandleScale }: { handleScale: number; onHandleScale: (scale: number) => void }) {
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
			{open && (
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
					<button type="button" className="settings-reset" onClick={() => onHandleScale(1)} disabled={handleScale === 1}>
						Reset
					</button>
				</div>
			)}
		</div>
	);
}
