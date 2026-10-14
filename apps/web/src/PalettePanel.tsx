import { type Design, MAX_PALETTE_SIZE, type NodeId } from '@holecraft/core';
import { type Dispatch, useState } from 'react';
import { ColourField, useColourEdit } from './ColourField.tsx';
import type { EditorAction } from './editorState.ts';

interface Props {
	design: Design;
	selection: readonly NodeId[];
	dispatch: Dispatch<EditorAction>;
}

/**
 * The design's palette: its filament colours for multi-material printing. Clicking a colour paints the
 * selected shapes with it and makes it the chosen colour; the chosen colour can then be changed (everything
 * painted with it changes too) or removed, and more colours can be added.
 */
export function PalettePanel({ design, selection, dispatch }: Props) {
	const [chosen, setChosen] = useState(0);
	const { palette } = design;
	const slot = Math.min(chosen, palette.length - 1);
	const edit = useColourEdit(
		dispatch,
		(color) => ({ type: 'previewPalette', slot, color }),
		(color) => ({ type: 'paletteSet', slot, color }),
	);

	return (
		<section aria-label="Colours">
			<h2>Colours</h2>
			<p className="muted hint">Each colour is a filament for multi-colour printing. Click one to paint the selected shapes.</p>

			<div className="palette" role="group" aria-label="Palette">
				{palette.map((hex, index) => (
					<button
						key={hex}
						type="button"
						className="palette-tile"
						style={{ background: hex }}
						aria-label={`Colour ${index + 1}: ${hex}`}
						aria-pressed={index === slot}
						title={`Colour ${index + 1} (filament ${index + 1})`}
						onClick={() => {
							setChosen(index);
							if (selection.length > 0) dispatch({ type: 'setColor', ids: [...selection], color: hex });
						}}
					>
						{index + 1}
					</button>
				))}
			</div>

			<div className="palette-edit">
				<ColourField label={`Colour ${slot + 1}`} inputLabel="Change the chosen colour" value={palette[slot]!} {...edit} />
				<div className="button-row">
					<button
						type="button"
						disabled={palette.length >= MAX_PALETTE_SIZE}
						onClick={() => dispatch({ type: 'paletteAdd' })}
						title={`Add a colour (up to ${MAX_PALETTE_SIZE})`}
					>
						Add colour
					</button>
					<button
						type="button"
						disabled={palette.length <= 1}
						onClick={() => dispatch({ type: 'paletteRemove', slot })}
						title="Remove the chosen colour from the palette"
					>
						Remove colour
					</button>
				</div>
			</div>
		</section>
	);
}
