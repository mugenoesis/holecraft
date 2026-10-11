import { DesignValidationError } from '@holecraft/core';
import type { FastifyInstance } from 'fastify';
import { DesignStore, StoredDesignError } from './designs.ts';
import { MAX_THUMBNAIL_BYTES, ThumbnailStore } from './thumbnails.ts';

const NOT_FOUND = { error: 'Design not found' };

/** Largest design body accepted: roomy for thousands of shapes, small enough to refuse abuse. */
export const MAX_DESIGN_BYTES = 8 * 1024 * 1024;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The design storage API: list, create, open, save, rename, duplicate and delete. */
export function registerDesignRoutes(app: FastifyInstance, store: DesignStore, thumbnails: ThumbnailStore): void {
	app.setErrorHandler((error, request, reply) => {
		if (error instanceof DesignValidationError) return reply.code(400).send({ error: error.message, path: error.path });
		// The message names the design but never a file path on the server.
		if (error instanceof StoredDesignError) return reply.code(500).send({ error: error.message });

		const status = (error as { statusCode?: number }).statusCode ?? 500;
		if (status === 413) return reply.code(413).send({ error: 'That is too large to save' });
		if (status >= 400 && status < 500) return reply.code(status).send({ error: error instanceof Error ? error.message : 'Bad request' });
		request.log.error(error);
		return reply.code(500).send({ error: 'Something went wrong on the server' });
	});

	app.get('/api/designs', async () => {
		const [designs, times] = await Promise.all([store.list(), thumbnails.times()]);
		return designs.map((d) => (times.has(d.id) ? { ...d, thumbnailAt: times.get(d.id) } : d));
	});

	app.post('/api/designs', async (request, reply) => {
		const body = request.body;
		if (body !== undefined && body !== null && !isObject(body)) return reply.code(400).send({ error: 'Expected an object' });
		const name = (body as Record<string, unknown> | null | undefined)?.name;
		if (name !== undefined && typeof name !== 'string') return reply.code(400).send({ error: 'name must be text' });
		return reply.code(201).send(await store.create(name));
	});

	app.get<{ Params: { id: string } }>('/api/designs/:id', async (request, reply) => {
		const design = await store.get(request.params.id);
		return design ?? reply.code(404).send(NOT_FOUND);
	});

	app.put<{ Params: { id: string } }>('/api/designs/:id', async (request, reply) => {
		const saved = await store.save(request.params.id, request.body);
		return saved ?? reply.code(404).send(NOT_FOUND);
	});

	app.patch<{ Params: { id: string } }>('/api/designs/:id', async (request, reply) => {
		const name = isObject(request.body) ? request.body.name : undefined;
		if (typeof name !== 'string') return reply.code(400).send({ error: 'name must be text' });
		const renamed = await store.rename(request.params.id, name);
		return renamed ?? reply.code(404).send(NOT_FOUND);
	});

	app.post<{ Params: { id: string } }>('/api/designs/:id/duplicate', async (request, reply) => {
		const copy = await store.duplicate(request.params.id);
		if (!copy) return reply.code(404).send(NOT_FOUND);
		await thumbnails.copy(request.params.id, copy.id);
		return reply.code(201).send(copy);
	});

	app.delete<{ Params: { id: string } }>('/api/designs/:id', async (request, reply) => {
		const deleted = await store.delete(request.params.id);
		if (deleted) await thumbnails.delete(request.params.id);
		return deleted ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
	});

	app.addContentTypeParser('image/png', { parseAs: 'buffer', bodyLimit: MAX_THUMBNAIL_BYTES }, (_request, body, done) => done(null, body));

	app.put<{ Params: { id: string } }>('/api/designs/:id/thumbnail', { bodyLimit: MAX_THUMBNAIL_BYTES }, async (request, reply) => {
		if (!(await store.exists(request.params.id))) return reply.code(404).send(NOT_FOUND);
		if (!Buffer.isBuffer(request.body) || !(await thumbnails.put(request.params.id, request.body))) {
			return reply.code(400).send({ error: 'That is not a usable thumbnail (send a PNG, up to 512 x 512 pixels)' });
		}
		return reply.code(204).send();
	});

	app.get<{ Params: { id: string } }>('/api/designs/:id/thumbnail', async (request, reply) => {
		const picture = await thumbnails.get(request.params.id);
		if (!picture) return reply.code(404).send({ error: 'No thumbnail yet' });
		// The list adds ?v=<time> to the address, so each new picture has its own address and can be kept for good.
		return reply
			.header('content-type', 'image/png')
			.header('x-content-type-options', 'nosniff')
			.header('cache-control', 'public, max-age=31536000, immutable')
			.send(picture);
	});
}
