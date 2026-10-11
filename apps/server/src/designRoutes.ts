import { DesignValidationError } from '@holecraft/core';
import type { FastifyInstance } from 'fastify';
import { DesignStore, StoredDesignError } from './designs.ts';

const NOT_FOUND = { error: 'Design not found' };

/** Largest design body accepted: roomy for thousands of shapes, small enough to refuse abuse. */
export const MAX_DESIGN_BYTES = 8 * 1024 * 1024;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The design storage API: list, create, open, save, rename, duplicate and delete. */
export function registerDesignRoutes(app: FastifyInstance, store: DesignStore): void {
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

  app.get('/api/designs', async () => store.list());

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
    return copy ? reply.code(201).send(copy) : reply.code(404).send(NOT_FOUND);
  });

  app.delete<{ Params: { id: string } }>('/api/designs/:id', async (request, reply) => {
    return (await store.delete(request.params.id)) ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
  });
}
