import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CavityList } from './CavityList.tsx';

const fill = { positions: new Float32Array(), indices: new Uint32Array() };
const CAVITIES = [
	{ id: 0, layer: 16, z: 8.25, areaMm2: 256.4, fill },
	{ id: 1, layer: 4, z: 2.25, areaMm2: 30, fill },
];

const list = (over: Partial<Parameters<typeof CavityList>[0]> = {}) =>
	renderToStaticMarkup(
		createElement(CavityList, {
			cavities: CAVITIES,
			selected: null,
			show: true,
			busy: false,
			filled: false,
			error: null,
			onSelect: () => {},
			onShow: () => {},
			onFill: () => {},
			...over,
		}),
	);

describe('the closed cavity list', () => {
	it('says how many cavities there are, and lists each with its size and where it begins', () => {
		const html = list();
		expect(html).toContain('2 closed cavities');
		expect(html).toContain('cupping');
		expect(html).toContain('Cavity 1');
		expect(html).toContain('256 mm²');
		expect(html).toContain('from 8.3 mm');
		expect(html).toContain('Cavity 2');
	});

	it('says one cavity in the singular', () => {
		expect(list({ cavities: [CAVITIES[0]!] })).toContain('1 closed cavity');
	});

	it('marks the chosen cavity, and fills only when one is chosen', () => {
		expect(list({ selected: 1 })).toMatch(/aria-pressed="true"[^>]*>\s*<span>Cavity 2/);
		expect(list()).toMatch(/<button[^>]*disabled=""[^>]*>Fill selected cavity/);
		expect(list({ selected: 1 })).not.toMatch(/<button[^>]*disabled=""[^>]*>Fill selected cavity/);
	});

	it('offers to fill them all, and to hide them in the view', () => {
		const html = list({ show: false });
		expect(html).toContain('Fill all');
		expect(html).toContain('Show cavities');
		expect(html).not.toContain('checked=""');
		expect(list()).toContain('checked=""');
	});

	it('turns the buttons off while a fill is being made', () => {
		expect(list({ selected: 0, busy: true }).match(/disabled=""/g)).toHaveLength(2);
	});

	it('shows the problem when a fill failed', () => {
		expect(list({ error: 'not a model' })).toContain('not a model');
	});

	it('says the cavities are gone once they have been filled', () => {
		expect(list({ cavities: [], filled: true })).toContain('No closed cavities left.');
	});

	it('shows nothing when there is no cavity and nothing was filled', () => {
		expect(list({ cavities: [] })).toBe('');
	});
});
