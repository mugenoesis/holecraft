import type { FastifyInstance } from 'fastify';
import type { InboxStore } from './inbox.ts';

/** How a file is sent to the inbox. Not a type a web form or a plain fetch can use without the server's permission (it needs a preflight). */
export const IMPORT_CONTENT_TYPE = 'application/vnd.holecraft.import';

/** The header the browser add-on sends. Another site cannot add it to a request to this server (a custom header needs the server's agreement). */
const IMPORT_HEADER = 'x-holecraft-import';

/** Largest file accepted: the editor's own import limit (a binary STL of three million triangles is 150 MB). */
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

/**
 * Where model files from other places wait to be opened: the browser add-on sends one with `POST /api/import` and is told the address to open
 * (`/import/<id>`), where the editor takes it, makes a design from it and deletes it from here. Nothing is stored for long (see InboxStore).
 */
export function registerImportRoutes(app: FastifyInstance, inbox: InboxStore): void {
	app.addContentTypeParser(IMPORT_CONTENT_TYPE, { parseAs: 'buffer', bodyLimit: MAX_IMPORT_BYTES }, (_request, body, done) =>
		done(null, body),
	);

	app.post('/api/import', { bodyLimit: MAX_IMPORT_BYTES }, async (request, reply) => {
		// the content type decides first: a request in any other form never reaches the inbox
		if (request.headers['content-type']?.split(';')[0]?.trim() !== IMPORT_CONTENT_TYPE) {
			return reply.code(415).send({ error: `Send the file as ${IMPORT_CONTENT_TYPE}` });
		}
		if (request.headers[IMPORT_HEADER] !== '1') return reply.code(403).send({ error: `Missing the ${IMPORT_HEADER} header` });
		const raw = request.headers['x-file-name'];
		if (typeof raw !== 'string' || raw === '') return reply.code(400).send({ error: 'Say the file name in x-file-name (URL-encoded)' });
		let name: string;
		try {
			name = decodeURIComponent(raw);
		} catch {
			return reply.code(400).send({ error: 'x-file-name is not valid URL-encoded text' });
		}
		if (!Buffer.isBuffer(request.body) || request.body.length === 0) return reply.code(400).send({ error: 'The file is empty' });

		const put = await inbox.put(name, request.body);
		return reply.code(201).send({ ...put, openUrl: `/import/${put.id}` });
	});

	app.get<{ Params: { id: string } }>('/api/import/:id', async (request, reply) => {
		const found = await inbox.get(request.params.id);
		if (!found) return reply.code(404).send({ error: 'Nothing is waiting there (it may have been opened already, or expired)' });
		return reply
			.header('content-type', 'application/octet-stream')
			.header('x-file-name', encodeURIComponent(found.name))
			.header('cache-control', 'no-store')
			.send(Buffer.from(found.bytes));
	});

	app.delete<{ Params: { id: string } }>('/api/import/:id', async (request, reply) => {
		return (await inbox.remove(request.params.id)) ? reply.code(204).send() : reply.code(404).send({ error: 'Nothing is waiting there' });
	});
}
