import { type ComponentProps, createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelEdge } from './PanelEdge.tsx';
import { PanelSection } from './PanelSection.tsx';
import { SectionFoldingContext } from './usePanelLayout.ts';

/** The section as the page uses it: its contents are the children it is given. */
const Section = PanelSection as unknown as FunctionComponent<Omit<ComponentProps<typeof PanelSection>, 'children'>>;

const section = (folding: { folded: string[]; toggle: () => void } | null) =>
	renderToStaticMarkup(
		createElement(
			SectionFoldingContext.Provider,
			{ value: folding },
			createElement(Section, { title: 'Resin' }, createElement('p', null, 'inside')),
		),
	);

describe('PanelSection', () => {
	it('is a region with its heading and its contents', () => {
		const html = section(null);
		expect(html).toContain('aria-label="Resin"');
		expect(html).toMatch(/<h2>Resin<\/h2>/);
		expect(html).toContain('inside');
	});

	it('has no fold arrow without the desktop layout (a phone’s tabs)', () => {
		expect(section(null)).not.toContain('Collapse');
	});

	it('has an arrow that says it folds the section, and is open', () => {
		const html = section({ folded: [], toggle: () => {} });
		expect(html).toContain('aria-label="Collapse Resin"');
		expect(html).toContain('aria-expanded="true"');
		expect(html).not.toMatch(/<div id="section-resin" hidden/);
	});

	it('hides the contents of a folded section, but keeps them in the page', () => {
		const html = section({ folded: ['Resin'], toggle: () => {} });
		expect(html).toContain('aria-label="Expand Resin"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toMatch(/<div id="section-resin" hidden="">/);
		expect(html).toContain('inside');
	});

	it('folds only the section that is named', () => {
		expect(section({ folded: ['Arrange'], toggle: () => {} })).toContain('aria-label="Collapse Resin"');
	});
});

describe('PanelEdge', () => {
	const edge = (compact: boolean, width = 300) =>
		renderToStaticMarkup(createElement(PanelEdge, { compact, width, onWidth: () => {}, onReset: () => {} }));

	it('is nothing on the compact layout', () => {
		expect(edge(true)).toBe('');
	});

	it('is a focusable vertical separator that says how wide the panel is and how wide it can be', () => {
		const html = edge(false, 300);
		expect(html).toContain('role="separator"');
		expect(html).toContain('aria-orientation="vertical"');
		expect(html).toContain('aria-label="Resize the side panel"');
		expect(html).toContain('aria-valuenow="300"');
		expect(html).toContain('aria-valuemin="220"');
		expect(html).toContain('aria-valuemax="560"');
		expect(html).toContain('tabindex="0"');
	});
});

describe('PanelSection with a two-word title', () => {
	it('names the contents by an id that has no space, which aria-controls needs', () => {
		const html = renderToStaticMarkup(
			createElement(
				SectionFoldingContext.Provider,
				{ value: { folded: [], toggle: () => {} } },
				createElement(Section, { title: 'Model check' }, createElement('p', null, 'inside')),
			),
		);
		expect(html).toContain('aria-controls="section-model-check"');
		expect(html).toContain('id="section-model-check"');
	});
});
