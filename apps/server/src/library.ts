import { type Design, DesignValidationError, type LibrarySummary, libraryColor, MAX_NAME_LENGTH, parseDesign } from '@holecraft/core';
import type { FastifyInstance } from 'fastify';
import { DesignStore, isValidDesignId } from './designs.ts';

const NOT_FOUND = { error: 'Saved shape not found' };
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function cleanName(name: unknown): string {
	const cleaned = typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
	if (!cleaned) throw new DesignValidationError('name', 'must not be blank');
	return cleaned;
}

/**
 * The library of saved shapes, kept like designs (one JSON file each, in `<data>/library/`) because each one is a small design: a single shape or
 * group standing at the origin. Everything is checked as a design on the way in, so only a good, single-rooted design is ever stored.
 */
export class LibraryStore {
	private readonly store: DesignStore;

	constructor(dataDir: string) {
		this.store = new DesignStore(dataDir, 'library');
	}

	private summary(design: Design): LibrarySummary {
		return { id: design.id, name: design.name, color: libraryColor(design), createdAt: design.createdAt };
	}

	async list(): Promise<LibrarySummary[]> {
		const items: LibrarySummary[] = [];
		for (const { id } of await this.store.list()) {
			const design = await this.store.get(id).catch(() => null);
			if (design) items.push(this.summary(design));
		}
		return items;
	}

	get(id: string): Promise<Design | null> {
		return this.store.get(id);
	}

	/** Saves a shape (a design whose one root is the thing saved) as `name`. Throws DesignValidationError if it is not that. */
	async add(name: unknown, input: unknown): Promise<LibrarySummary> {
		const cleaned = cleanName(name);
		const parsed = parseDesign(input);
		const root = parsed.roots.length === 1 ? parsed.nodes[parsed.roots[0]!] : undefined;
		if (!root) throw new DesignValidationError('roots', 'must hold exactly one shape or group');
		const created = await this.store.create(cleaned);
		const saved = await this.store.save(created.id, {
			...parsed,
			id: created.id,
			name: cleaned,
			nodes: { ...parsed.nodes, [root.id]: { ...root, name: cleaned } },
		});
		return this.summary(saved ?? created);
	}

	/** Renames the entry, and the shape in it, which is what a copy is called when it is added. */
	async rename(id: string, name: unknown): Promise<LibrarySummary | null> {
		const cleaned = cleanName(name);
		const design = await this.store.get(id);
		const root = design?.nodes[design.roots[0] ?? ''];
		if (!design || !root) return null;
		const saved = await this.store.save(id, {
			...design,
			name: cleaned,
			nodes: { ...design.nodes, [root.id]: { ...root, name: cleaned } },
		});
		return saved ? this.summary(saved) : null;
	}

	delete(id: string): Promise<boolean> {
		return this.store.delete(id);
	}
}

/** The library API: list, save, open, rename and delete saved shapes. */
export function registerLibraryRoutes(app: FastifyInstance, store: LibraryStore): void {
	app.get('/api/library', async () => store.list());

	app.post('/api/library', async (request, reply) => {
		const body = request.body;
		if (!isObject(body)) return reply.code(400).send({ error: 'Expected an object' });
		return reply.code(201).send(await store.add(body.name, body.design));
	});

	app.get<{ Params: { id: string } }>('/api/library/:id', async (request, reply) => {
		const found = isValidDesignId(request.params.id) ? await store.get(request.params.id) : null;
		return found ?? reply.code(404).send(NOT_FOUND);
	});

	app.patch<{ Params: { id: string } }>('/api/library/:id', async (request, reply) => {
		if (!isValidDesignId(request.params.id)) return reply.code(404).send(NOT_FOUND);
		const name = isObject(request.body) ? request.body.name : undefined;
		return (await store.rename(request.params.id, name)) ?? reply.code(404).send(NOT_FOUND);
	});

	app.delete<{ Params: { id: string } }>('/api/library/:id', async (request, reply) => {
		const deleted = isValidDesignId(request.params.id) && (await store.delete(request.params.id));
		return deleted ? reply.code(204).send() : reply.code(404).send(NOT_FOUND);
	});
}
