import { FILAMENT_COLOURS } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColourField, colourEditEvents } from './ColourField.tsx';
import { ColourPicker } from './ColourPicker.tsx';
import type { EditorAction } from './editorState.ts';

const noop = () => {};

describe('colourEditEvents', () => {
	const setup = () => {
		const sent: EditorAction[] = [];
		const events = colourEditEvents(
			(a) => sent.push(a),
			() => ({
				preview: (color) => ({ type: 'previewColor', ids: ['a'], color }),
				commit: (color) => ({ type: 'setColor', ids: ['a'], color }),
			}),
		);
		return { sent, events };
	};

	it('makes a drag one colourStart, a preview per colour and one moveEnd', () => {
		const { sent, events } = setup();
		events.onPreview('#111111');
		events.onPreview('#222222');
		events.onRelease();
		events.onRelease(); // a second release (the picker closing) adds nothing
		expect(sent.map((a) => a.type)).toEqual(['colourStart', 'previewColor', 'previewColor', 'moveEnd']);
	});

	it('makes a chosen colour one ordinary edit, ending any drag first', () => {
		const { sent, events } = setup();
		events.onCommit('#333333');
		expect(sent).toEqual([{ type: 'setColor', ids: ['a'], color: '#333333' }]);
		sent.length = 0;
		events.onPreview('#444444');
		events.onCommit('#555555');
		expect(sent.map((a) => a.type)).toEqual(['colourStart', 'previewColor', 'moveEnd', 'setColor']);
	});
});

describe('ColourField', () => {
	it('has a swatch for the wheel and a hex box with the given name', () => {
		const html = renderToStaticMarkup(
			createElement(ColourField, {
				label: 'Color',
				inputLabel: 'Color',
				value: '#123456',
				onPreview: noop,
				onRelease: noop,
				onCommit: noop,
			}),
		);
		expect(html).toContain('aria-label="Open the colour wheel (#123456)"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('aria-label="Color"');
		expect(html).toContain('value="#123456"');
	});
});

describe('ColourPicker', () => {
	const render = (designColours?: string[]) =>
		renderToStaticMarkup(
			createElement(ColourPicker, {
				value: '#ff0000',
				...(designColours && { designColours }),
				onPreview: noop,
				onRelease: noop,
				onCommit: noop,
				onClose: noop,
			}),
		);

	it('puts the marker at the top of the rim for red, at full brightness', () => {
		const html = render();
		expect(html).toContain('left:50%;top:0%');
		expect(html).toContain('aria-valuenow="0"');
		expect(html).toContain('value="100"');
	});

	it('offers every filament colour, with the current one pressed', () => {
		const html = render();
		for (const c of FILAMENT_COLOURS) expect(html).toContain(`aria-label="${c.name}: ${c.hex}"`);
		expect(html).not.toContain('In this design');
	});

	it("offers the design's own colours first when given", () => {
		const html = render(['#ff0000', '#00ff00']);
		expect(html).toContain('In this design');
		expect(html).toContain('aria-label="Colour 2: #00ff00"');
		expect(html).toMatch(/aria-label="Colour 1: #ff0000"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Colour 1: #ff0000"/);
	});
});
