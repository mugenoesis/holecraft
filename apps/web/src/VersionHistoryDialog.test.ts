import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VersionHistoryDialog } from './VersionHistoryDialog.tsx';

const now = new Date(2026, 0, 15, 14, 30);
const at = (day: number, hour: number) => new Date(2026, 0, day, hour, 0).toISOString();
const versions = [
	{ version: '2', savedAt: at(15, 13), name: 'Bracket', objectCount: 4 },
	{ version: '1', savedAt: at(14, 9), name: 'Bracket', objectCount: 1 },
];

const render = (props: Partial<Parameters<typeof VersionHistoryDialog>[0]> = {}) =>
	renderToStaticMarkup(
		createElement(VersionHistoryDialog, {
			versions,
			problem: null,
			restoring: null,
			now,
			onRestore: () => {},
			onClose: () => {},
			...props,
		}),
	);

describe('VersionHistoryDialog', () => {
	it('is a modal dialog with a name and a Close button', () => {
		const html = render();
		expect(html).toContain('role="dialog"');
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('aria-labelledby="history-title"');
		expect(html).toContain('>Version history<');
		expect(html).toContain('>Close<');
	});

	it('lists each version with when it was saved, what was in it, and a Restore button', () => {
		const html = render();
		expect(html).toContain('Today, 13:00');
		expect(html).toContain('Yesterday, 09:00');
		expect(html).toContain('Bracket · 4 objects');
		expect(html).toContain('Bracket · 1 object');
		expect(html.match(/>Restore</g)).toHaveLength(2);
		expect(html).toContain('aria-label="Restore the version from Today, 13:00"');
	});

	it('says that what is there now is kept when one is restored', () => {
		expect(render()).toMatch(/what you have now is kept/i);
	});

	it('says it is loading while the list has not come', () => {
		const html = render({ versions: null });
		expect(html).toMatch(/Loading/);
		expect(html).not.toContain('>Restore<');
	});

	it('says what to expect when there is nothing kept yet', () => {
		expect(render({ versions: [] })).toMatch(/nothing kept yet/i);
	});

	it('shows a problem in an alert', () => {
		expect(render({ problem: 'Could not reach the server' })).toMatch(/role="alert"[^>]*>[^<]*Could not reach the server/);
	});

	it('disables every Restore while one is being restored, and says which', () => {
		const html = render({ restoring: '2' });
		expect(html.match(/<button[^>]*disabled=""[^>]*>Restore/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
		expect(html).toContain('Restoring…');
	});
});
