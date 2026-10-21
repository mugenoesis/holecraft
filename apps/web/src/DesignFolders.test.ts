import type { DesignSummary } from '@holecraft/core';
import { type ComponentProps, createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignGroup } from './DesignFolders.tsx';

/** The group as the page uses it: its contents are the children it is given. */
const Group = DesignGroup as unknown as FunctionComponent<Omit<ComponentProps<typeof DesignGroup>, 'children'>>;

const design = (id: string): DesignSummary => ({
	id,
	name: id,
	createdAt: '2026-01-01T00:00:00Z',
	updatedAt: '2026-01-01T00:00:00Z',
	objectCount: 1,
});

const render = (folder: string | null, count: number, extra: { hasFolders?: boolean; open?: boolean } = {}) =>
	renderToStaticMarkup(
		createElement(
			Group,
			{
				group: { folder, designs: Array.from({ length: count }, (_, i) => design(`d${i}`)) },
				hasFolders: extra.hasFolders ?? true,
				open: extra.open ?? true,
				onToggle: () => {},
				onRename: async () => {},
				onRemove: async () => {},
			},
			createElement('p', null, 'the designs'),
		),
	);

describe('DesignGroup', () => {
	it('is a region named after the folder, with its heading, its count and its designs', () => {
		const html = render('Printer parts', 2);
		expect(html).toContain('aria-label="Folder Printer parts"');
		expect(html).toMatch(/<h2[^>]*>Printer parts<\/h2>/);
		expect(html).toContain('2 designs');
		expect(html).toContain('the designs');
	});

	it('says "1 design" for one', () => {
		expect(render('Home', 1)).toContain('1 design<');
	});

	it('has an arrow that says what it does and whether the folder is open', () => {
		const open = render('Home', 1, { open: true });
		expect(open).toContain('aria-label="Collapse folder Home"');
		expect(open).toContain('aria-expanded="true"');
		const folded = render('Home', 1, { open: false });
		expect(folded).toContain('aria-label="Expand folder Home"');
		expect(folded).toContain('aria-expanded="false"');
	});

	it('has buttons to rename and to remove the folder', () => {
		const html = render('Home', 1);
		expect(html).toContain('aria-label="Rename folder Home"');
		expect(html).toContain('aria-label="Remove folder Home"');
	});

	it('gives the designs in no folder a heading only when there are folders', () => {
		expect(render(null, 1, { hasFolders: true })).toMatch(/<h2[^>]*>Not in a folder<\/h2>/);
		const alone = render(null, 1, { hasFolders: false });
		expect(alone).not.toContain('<h2');
		expect(alone).toContain('the designs');
		expect(alone).not.toContain('Rename folder');
	});
});
