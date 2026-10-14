import { FILAMENT_COLOURS, type Hsv, hexToHsv, hsvToHex, hueSatAtWheel, wheelPointOf } from '@holecraft/core';
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';

/** What a colour control reports: a colour being dragged (shown, not kept), the end of the drag (keep it), or a colour chosen outright. */
export interface ColourEvents {
	onPreview: (hex: string) => void;
	onRelease: () => void;
	onCommit: (hex: string) => void;
}

interface Props extends ColourEvents {
	value: string;
	/** The colours already in the design, offered first (the palette, for a shape). */
	designColours?: readonly string[];
	onClose: () => void;
}

const KEY_STEPS: Record<string, [number, number]> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] };

/**
 * A colour wheel (hue round the rim, white in the middle), a brightness slider and ready-made filament colours, floating
 * over the view so the shapes stay in sight. Dragging previews the colour on the shapes; letting go keeps it.
 */
export function ColourPicker({ value, designColours, onPreview, onRelease, onCommit, onClose }: Props) {
	const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
	const root = useRef<HTMLDivElement>(null);
	const hex = hsvToHex(hsv);

	// A change from outside (undo, a typed hex) moves the wheel; the wheel's own changes are left alone, so a grey keeps its hue.
	useEffect(() => {
		setHsv((current) => (hsvToHex(current) === value ? current : hexToHsv(value)));
	}, [value]);

	// Closes on Escape or a press anywhere else (the swatch that opened it toggles it itself).
	useEffect(() => {
		const onKey = (e: globalThis.KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopPropagation();
			onClose();
		};
		const onDown = (e: globalThis.PointerEvent) => {
			const target = e.target as Node;
			if (!root.current?.contains(target) && !(target instanceof Element && target.closest('.colour-swatch'))) onClose();
		};
		window.addEventListener('keydown', onKey, true);
		window.addEventListener('pointerdown', onDown, true);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			window.removeEventListener('pointerdown', onDown, true);
		};
	}, [onClose]);

	const show = (next: Hsv) => {
		setHsv(next);
		onPreview(hsvToHex(next));
	};

	const pickAt = (e: PointerEvent<HTMLDivElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		const r = box.width / 2;
		const { h, s } = hueSatAtWheel((e.clientX - box.left - r) / r, (e.clientY - box.top - r) / r);
		// a fully dark colour has no hue to show, so picking on the wheel brings the brightness up
		show({ h, s, v: hsv.v === 0 ? 1 : hsv.v });
	};

	const onWheelKey = (e: KeyboardEvent<HTMLDivElement>) => {
		const step = KEY_STEPS[e.key];
		if (!step) return;
		e.preventDefault();
		show({ h: (hsv.h + step[0] + 360) % 360, s: Math.min(1, Math.max(0, hsv.s + step[1])), v: hsv.v });
		onRelease();
	};

	const marker = wheelPointOf(hsv.h, hsv.s);
	const swatch = (c: string, name: string) => (
		<button
			key={c}
			type="button"
			className="colour-preset"
			style={{ background: c }}
			aria-label={`${name}: ${c}`}
			title={name}
			aria-pressed={c === value}
			onClick={() => onCommit(c)}
		/>
	);

	return (
		<div className="colour-picker" ref={root} role="dialog" aria-label="Pick a colour">
			<div className="colour-picker-main">
				<div
					className="colour-wheel"
					role="slider"
					tabIndex={0}
					aria-label="Colour wheel"
					aria-valuemin={0}
					aria-valuemax={359}
					aria-valuenow={Math.round(hsv.h)}
					aria-valuetext={`hue ${Math.round(hsv.h)} degrees, saturation ${Math.round(hsv.s * 100)}%`}
					onPointerDown={(e) => {
						e.currentTarget.setPointerCapture(e.pointerId);
						pickAt(e);
					}}
					onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && pickAt(e)}
					onPointerUp={onRelease}
					onPointerCancel={onRelease}
					onKeyDown={onWheelKey}
				>
					<div className="colour-wheel-shade" style={{ opacity: 1 - hsv.v }} />
					<div className="colour-wheel-marker" style={{ left: `${50 + marker.x * 50}%`, top: `${50 + marker.y * 50}%`, background: hex }} />
				</div>
				<div className="colour-picker-side">
					<div className="colour-compare" aria-hidden="true">
						<span style={{ background: hex }} />
					</div>
					<output className="colour-hex">{hex}</output>
					<label className="colour-brightness">
						<span>Brightness</span>
						<input
							type="range"
							min={0}
							max={100}
							value={Math.round(hsv.v * 100)}
							style={{ background: `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 1 })})` }}
							onChange={(e) => show({ ...hsv, v: Number(e.target.value) / 100 })}
							onPointerUp={onRelease}
							onKeyUp={onRelease}
						/>
					</label>
				</div>
			</div>
			{designColours && designColours.length > 0 && (
				<fieldset className="colour-presets" aria-label="Colours in this design">
					<legend>In this design</legend>
					{designColours.map((c, i) => swatch(c, `Colour ${i + 1}`))}
				</fieldset>
			)}
			<fieldset className="colour-presets" aria-label="Filament colours">
				<legend>Filament colours</legend>
				{FILAMENT_COLOURS.map((c) => swatch(c.hex, c.name))}
			</fieldset>
			<div className="button-row">
				<button type="button" onClick={onClose}>
					Done
				</button>
			</div>
		</div>
	);
}
