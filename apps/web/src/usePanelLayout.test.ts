import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { usePanelLayout } from './usePanelLayout.ts';

/** What the hook gives on a first look, as text. */
function look(compact: boolean): string {
	function Probe() {
		const layout = usePanelLayout(compact);
		const style = layout.style ? JSON.stringify(layout.style) : 'none';
		return createElement(
			'p',
			null,
			`${layout.width};${style};${layout.folding ? `folding:${layout.folding.folded.length}` : 'no folding'}`,
		);
	}
	return renderToStaticMarkup(createElement(Probe)).replace(/<\/?p>/g, '');
}

describe('usePanelLayout', () => {
	it('gives the desktop panel its usual width, as a style, and starts with only Resin folded', () => {
		expect(look(false)).toBe('260;{&quot;--panel-width&quot;:&quot;260px&quot;};folding:1');
	});

	it('gives the compact layout no width and no folding: its panel is tabs', () => {
		expect(look(true)).toBe('260;none;no folding');
	});
});
