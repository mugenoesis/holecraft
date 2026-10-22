import { describe, expect, it } from 'vitest';
import { classifyResponse, filenameFromDisposition } from './detect.ts';

const ok = (over: Partial<Parameters<typeof classifyResponse>[0]> = {}) => ({
	url: 'https://cdn.example.com/files/abc',
	status: 200,
	...over,
});

describe('filenameFromDisposition', () => {
	it('reads a quoted or plain name', () => {
		expect(filenameFromDisposition('attachment; filename="Bracket v2.stl"')).toBe('Bracket v2.stl');
		expect(filenameFromDisposition('attachment; filename=part.3mf')).toBe('part.3mf');
		expect(filenameFromDisposition('inline; filename="a.obj"; size=3')).toBe('a.obj');
	});

	it('prefers the UTF-8 form, which has the real name', () => {
		expect(filenameFromDisposition('attachment; filename="fallback.stl"; filename*=UTF-8\'\'%C3%89tag%C3%A8re%20(1).stl')).toBe(
			'Étagère (1).stl',
		);
		expect(filenameFromDisposition("attachment; filename*=utf-8''gear.stl")).toBe('gear.stl');
	});

	it('is null when there is no name, or it cannot be read', () => {
		expect(filenameFromDisposition(undefined)).toBeNull();
		expect(filenameFromDisposition('attachment')).toBeNull();
		expect(filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A")).toBeNull();
	});
});

describe('classifyResponse', () => {
	it('is a model when the download is named like one', () => {
		const r = classifyResponse(
			ok({ contentDisposition: 'attachment; filename="Gear.STL"', contentType: 'application/octet-stream', contentLength: 5000 }),
		);
		expect(r).toEqual({ name: 'Gear.STL', kind: 'model', size: 5000 });
		expect(classifyResponse(ok({ contentDisposition: 'attachment; filename=a.3mf' }))?.kind).toBe('model');
		expect(classifyResponse(ok({ contentDisposition: 'attachment; filename=a.obj' }))?.kind).toBe('model');
		expect(classifyResponse(ok({ contentDisposition: 'attachment; filename=a.step' }))?.kind).toBe('model');
		expect(classifyResponse(ok({ contentDisposition: 'attachment; filename=a.stp' }))?.kind).toBe('model');
	});

	it('is a zip when it is named like one and is sent as a download', () => {
		expect(classifyResponse(ok({ contentDisposition: 'attachment; filename="All files.zip"' }))).toEqual({
			name: 'All files.zip',
			kind: 'zip',
		});
		expect(classifyResponse(ok({ url: 'https://cdn.example.com/pack.zip', contentType: 'application/zip' }))?.kind).toBe('zip');
		expect(classifyResponse(ok({ url: 'https://cdn.example.com/pack.zip', contentType: 'application/octet-stream' }))?.kind).toBe('zip');
	});

	it('is not a zip that a page loads for itself: named like one but sent as something else', () => {
		expect(classifyResponse(ok({ url: 'https://cdn.example.com/data.zip', contentType: 'text/html' }))).toBeNull();
		expect(classifyResponse(ok({ url: 'https://cdn.example.com/data.zip', contentType: 'application/json' }))).toBeNull();
	});

	it('takes the name from the address when the response has none', () => {
		expect(
			classifyResponse(ok({ url: 'https://files.example.com/media/prints/Left%20Arm.stl?token=abc&x=1', contentType: 'model/stl' })),
		).toEqual({
			name: 'Left Arm.stl',
			kind: 'model',
		});
	});

	it('knows a model by what it is sent as, and gives it a name', () => {
		expect(classifyResponse(ok({ contentType: 'model/stl' }))).toEqual({ name: 'model.stl', kind: 'model' });
		expect(classifyResponse(ok({ contentType: 'application/sla' }))?.name).toBe('model.stl');
		expect(classifyResponse(ok({ contentType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' }))?.name).toBe('model.3mf');
		expect(classifyResponse(ok({ contentType: 'model/3mf; charset=binary' }))?.name).toBe('model.3mf');
		expect(classifyResponse(ok({ contentType: 'model/obj' }))?.name).toBe('model.obj');
	});

	it('is nothing for pages, pictures, scripts and data', () => {
		for (const [url, contentType] of [
			['https://makerworld.com/en/models/1', 'text/html; charset=utf-8'],
			['https://cdn.example.com/photo.jpg', 'image/jpeg'],
			['https://cdn.example.com/app.js', 'application/javascript'],
			['https://cdn.example.com/api', 'application/json'],
			['https://cdn.example.com/x.png', 'image/png'],
			['https://cdn.example.com/thing.stl.txt', 'text/plain'],
		] as const) {
			expect(classifyResponse(ok({ url, contentType })), url).toBeNull();
		}
	});

	it('is nothing for a response that is not the whole file (an error, a redirect, a piece of it)', () => {
		for (const status of [206, 301, 302, 304, 403, 404, 500]) {
			expect(classifyResponse(ok({ status, contentDisposition: 'attachment; filename=a.stl' })), String(status)).toBeNull();
		}
	});

	it('cleans the name, so nothing from the site is trusted as a path', () => {
		expect(classifyResponse(ok({ contentDisposition: 'attachment; filename="../../etc/evil.stl"' }))?.name).toBe('evil.stl');
		expect(classifyResponse(ok({ contentDisposition: 'attachment; filename="C:\\Users\\x\\a.stl"' }))?.name).toBe('a.stl');
	});

	it('gives the size when the server said it, and not a wrong one', () => {
		expect(classifyResponse(ok({ contentDisposition: 'attachment; filename=a.stl', contentLength: 123 }))?.size).toBe(123);
		expect(classifyResponse(ok({ contentDisposition: 'attachment; filename=a.stl', contentLength: -1 }))).toEqual({
			name: 'a.stl',
			kind: 'model',
		});
		expect(classifyResponse(ok({ contentDisposition: 'attachment; filename=a.stl', contentLength: Number.NaN }))).toEqual({
			name: 'a.stl',
			kind: 'model',
		});
	});
});
