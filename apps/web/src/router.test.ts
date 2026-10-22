import { describe, expect, it } from 'vitest';
import { designPath, parseRoute } from './router.ts';

const id = '0123456789abcdef0123456789abcdef';

describe('parseRoute', () => {
	it('shows the designs list at the root', () => {
		expect(parseRoute('/')).toEqual({ name: 'home' });
		expect(parseRoute('')).toEqual({ name: 'home' });
	});

	it('opens a design by id', () => {
		expect(parseRoute(`/design/${id}`)).toEqual({ name: 'design', id });
	});

	it('ignores a trailing slash', () => {
		expect(parseRoute(`/design/${id}/`)).toEqual({ name: 'design', id });
		expect(parseRoute('//')).toEqual({ name: 'home' });
	});

	it('treats anything else as not found', () => {
		for (const path of ['/design', '/design/', '/designs/abc', '/nope', `/design/${id}/extra`, '/api/designs']) {
			expect(parseRoute(path), path).toEqual({ name: 'notfound' });
		}
	});

	it('does not pass odd characters through as an id', () => {
		expect(parseRoute('/design/%2e%2e')).toEqual({ name: 'notfound' });
		expect(parseRoute('/design/a b')).toEqual({ name: 'notfound' });
		expect(parseRoute(`/design/${id.toUpperCase()}`)).toEqual({ name: 'notfound' });
	});
});

describe('designPath', () => {
	it('builds the address of a design', () => {
		expect(designPath(id)).toBe(`/design/${id}`);
	});

	it('round-trips through parseRoute', () => {
		expect(parseRoute(designPath(id))).toEqual({ name: 'design', id });
	});
});

describe('the import route', () => {
	it('opens a file that is waiting to be imported, by id', () => {
		expect(parseRoute(`/import/${id}`)).toEqual({ name: 'import', id });
		expect(parseRoute(`/import/${id}/`)).toEqual({ name: 'import', id });
	});

	it('is not found without an id, with a bad one, or with more after it', () => {
		for (const path of ['/import', '/import/', '/import/abc', `/import/${id}/x`, `/import/${id.toUpperCase()}`, '/import/%2e%2e']) {
			expect(parseRoute(path), path).toEqual({ name: 'notfound' });
		}
	});
});
