import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportProblemView } from './ReportProblem.tsx';

const info = { version: '1.2.3', userAgent: 'UA', platform: 'P', screen: '1x1' };
const render = (props: Partial<Parameters<typeof ReportProblemView>[0]> = {}) =>
	renderToStaticMarkup(createElement(ReportProblemView, { info, errors: [], onCopy: () => {}, copied: null, ...props }));

describe('ReportProblemView', () => {
	it('links to a new issue, in a new tab that cannot reach back', () => {
		const html = render();
		expect(html).toContain('>Report a problem<');
		expect(html).toContain('href="https://github.com/mugenoesis/holecraft/issues/new?');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
	});

	it('has a button to copy the diagnostics', () => {
		expect(render()).toContain('>Copy diagnostics<');
	});

	it('says it was copied, or shows the text to copy by hand', () => {
		expect(render({ copied: 'done' })).toContain('Copied');
		const html = render({ copied: 'by-hand' });
		expect(html).toContain('<textarea');
		expect(html).toContain('Holecraft 1.2.3');
	});

	it('says what is and is not in the diagnostics', () => {
		expect(render()).toMatch(/no design data/i);
	});
});
