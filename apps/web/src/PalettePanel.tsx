import { MAX_PALETTE_SIZE, type Design, type NodeId } from '@holecraft/core';
import { useState, type Dispatch } from 'react';
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
        <label className="field">
          <span>Colour {slot + 1}</span>
          <input
            type="color"
            aria-label="Change the chosen colour"
            value={palette[slot]}
            onChange={(e) => dispatch({ type: 'paletteSet', slot, color: e.target.value })}
          />
        </label>
        <div className="button-row">
          <button type="button" disabled={palette.length >= MAX_PALETTE_SIZE} onClick={() => dispatch({ type: 'paletteAdd' })} title={`Add a colour (up to ${MAX_PALETTE_SIZE})`}>
            Add colour
          </button>
          <button type="button" disabled={palette.length <= 1} onClick={() => dispatch({ type: 'paletteRemove', slot })} title="Remove the chosen colour from the palette">
            Remove colour
          </button>
        </div>
      </div>
    </section>
  );
}
