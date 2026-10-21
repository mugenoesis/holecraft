import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FolderSelect } from './FolderSelect.tsx';

const render = (props: { folder?: string; folders?: string[]; disabled?: boolean }) =>
	renderToStaticMarkup(
		createElement(FolderSelect, {
			name: 'Bracket',
			folder: props.folder,
			folders: props.folders ?? ['Home', 'Printer parts'],
			disabled: props.disabled ?? false,
			onMove: () => {},
		}),
	);

describe('FolderSelect', () => {
	it('is named after the design and offers no folder, each folder, and a new one', () => {
		const html = render({});
		expect(html).toContain('aria-label="Folder for Bracket"');
		const labels = [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
		expect(labels).toEqual(['No folder', 'Home', 'Printer parts', 'New folder…']);
	});

	it('has "No folder" chosen for a design in none', () => {
		expect(render({})).toMatch(/<option value="none" selected="">No folder/);
	});

	it('has the design’s folder chosen, whatever the capitals', () => {
		expect(render({ folder: 'PRINTER PARTS' })).toMatch(/<option value="in:Printer parts" selected="">Printer parts/);
	});

	it('can be turned off while a move is under way', () => {
		expect(render({ disabled: true })).toContain('disabled=""');
	});

	it('does not let a folder be taken for the "none" or "new" choices', () => {
		const html = render({ folders: ['none', 'new'] });
		expect(html).toContain('value="in:none"');
		expect(html).toContain('value="in:new"');
	});
});
