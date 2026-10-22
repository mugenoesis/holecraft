import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChooseModels } from './ChooseModels.tsx';

const names = ['Left.stl', 'Right.3mf', 'Base.obj'];
const render = (selected: readonly string[], props: Partial<Parameters<typeof ChooseModels>[0]> = {}) =>
	renderToStaticMarkup(
		createElement(ChooseModels, {
			title: 'Brackets.zip',
			names,
			selected,
			busy: false,
			onToggle: () => {},
			onAll: () => {},
			onNone: () => {},
			onOpen: () => {},
			...props,
		}),
	);

describe('ChooseModels', () => {
	it('says which file it is and how many models are in it', () => {
		const html = render(names);
		expect(html).toContain('Brackets.zip');
		expect(html).toMatch(/3 models/);
		expect(html).toContain('>Which models do you want to open?<');
	});

	it('has a checkbox for each model, ticked for the ones selected', () => {
		const html = render(['Left.stl']);
		expect(html.match(/type="checkbox"/g)).toHaveLength(3);
		expect(html).toMatch(/<input[^>]*checked=""[^>]*aria-label="Left.stl"|<input[^>]*aria-label="Left.stl"[^>]*checked=""/);
		expect(html.match(/checked=""/g)).toHaveLength(1);
	});

	it('says how many it will open, and is off while none is chosen', () => {
		expect(render(names)).toContain('>Open 3 models<');
		expect(render(['Left.stl'])).toContain('>Open 1 model<');
		const none = render([]);
		expect(none).toMatch(/<button[^>]*disabled=""[^>]*>Open/);
	});

	it('can tick all or none, and go back to the list of designs', () => {
		const html = render(names);
		expect(html).toContain('>Select all<');
		expect(html).toContain('>Select none<');
		expect(html).toMatch(/<a[^>]*href="\/"[^>]*>/);
	});

	it('is off while it is opening them, and says so', () => {
		const html = render(names, { busy: true });
		expect(html).toContain('Opening…');
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Opening…/);
	});
});
