import { parseHexInput } from '@holecraft/core';
import { type Dispatch, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ColourEvents, ColourPicker } from './ColourPicker.tsx';
import type { EditorAction } from './editorState.ts';

/** The events of `useColourEdit`, outside React so they can be tested: a drag is colourStart, previews, then moveEnd. */
export function colourEditEvents(
	dispatch: Dispatch<EditorAction>,
	actions: () => { preview: (hex: string) => EditorAction; commit: (hex: string) => EditorAction },
): ColourEvents {
	let dragging = false;
	const release = () => {
		if (!dragging) return;
		dragging = false;
		dispatch({ type: 'moveEnd' });
	};
	return {
		onPreview: (hex) => {
			if (!dragging) dispatch({ type: 'colourStart' });
			dragging = true;
			dispatch(actions().preview(hex));
		},
		onRelease: release,
		onCommit: (hex) => {
			release();
			dispatch(actions().commit(hex));
		},
	};
}

/**
 * Wires a colour control to the editor: the wheel's drag is previewed on the shapes (colourStart, then `preview`
 * for each colour) and kept as one undo step when let go; a colour chosen outright is one ordinary edit.
 */
export function useColourEdit(
	dispatch: Dispatch<EditorAction>,
	preview: (hex: string) => EditorAction,
	commit: (hex: string) => EditorAction,
): ColourEvents {
	// the latest actions, so the returned callbacks stay the same between renders (the picker listens with them)
	const actions = useRef({ preview, commit });
	actions.current = { preview, commit };
	return useMemo(() => colourEditEvents(dispatch, () => actions.current), [dispatch]);
}

interface Props extends ColourEvents {
	label: string;
	/** The hex box's accessible name. */
	inputLabel: string;
	value: string;
	designColours?: readonly string[];
}

/** A swatch that opens the colour wheel, and a box for typing the colour as hex. A complete `#rrggbb` applies as it is typed. */
export function ColourField({ label, inputLabel, value, designColours, onPreview, onRelease, onCommit }: Props) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);

	const close = useCallback(() => {
		onRelease();
		setOpen(false);
	}, [onRelease]);

	const settle = (typed: string) => {
		const hex = parseHexInput(typed);
		if (hex && hex !== value) onCommit(hex);
		else setDraft(value);
	};

	return (
		<div className="field colour-field">
			<span>{label}</span>
			<div className="colour-field-row">
				<button
					type="button"
					className="colour-swatch"
					style={{ background: value }}
					aria-label={`Open the colour wheel (${value})`}
					aria-haspopup="dialog"
					aria-expanded={open}
					title="Choose from the colour wheel or filament colours"
					onClick={() => setOpen((o) => !o)}
				/>
				<input
					type="text"
					aria-label={inputLabel}
					spellCheck={false}
					autoComplete="off"
					maxLength={7}
					value={draft}
					onChange={(e) => {
						setDraft(e.target.value);
						// only a full six-digit colour applies while typing, so "#abc" on its way to "#abcdef" is not an extra undo step
						const hex = /^#?[0-9a-f]{6}$/i.test(e.target.value.trim()) ? parseHexInput(e.target.value) : null;
						if (hex && hex !== value) onCommit(hex);
					}}
					onBlur={(e) => settle(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') settle(e.currentTarget.value);
						else if (e.key === 'Escape') setDraft(value);
					}}
				/>
			</div>
			{open && (
				<ColourPicker
					value={value}
					{...(designColours && { designColours })}
					onPreview={onPreview}
					onRelease={onRelease}
					onCommit={onCommit}
					onClose={close}
				/>
			)}
		</div>
	);
}
