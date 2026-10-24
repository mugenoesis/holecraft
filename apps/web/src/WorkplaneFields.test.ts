import { createEmptyDesign } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkplaneFields } from './WorkplaneFields.tsx';

const render = (size: [number, number] = [200, 200]) => {
	const design = createEmptyDesign('d');
	return renderToStaticMarkup(
		createElement(WorkplaneFields, { design: { ...design, grid: { ...design.grid, size } }, dispatch: () => {} }),
	);
};

describe('WorkplaneFields', () => {
	it('is a Width and a Depth, showing the size now', () => {
		const html = render([350, 120.5]);
		expect(html).toContain('>Width<');
		expect(html).toContain('>Depth<');
		expect(html).toContain('value="350"');
		expect(html).toContain('value="120.5"');
	});

	it('says what it is for and how big it may be', () => {
		const html = render();
		expect(html).toMatch(/build plate/i);
		expect(html).toMatch(/10 mm/);
		expect(html).toMatch(/1000 mm \(100 cm\)/);
	});
});
