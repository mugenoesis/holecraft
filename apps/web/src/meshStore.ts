import type { MeshData } from '@holecraft/core';

/**
 * The imported models this editor has, by stored reference. Models are downloaded the first time a
 * design needs them and then kept. `table` is replaced (never mutated) on every change, so views
 * and effects can tell that something arrived.
 */
export class MeshStore {
	table: ReadonlyMap<string, MeshData> = new Map();
	/** References that could not be downloaded; not retried until the editor is reopened. */
	readonly failed = new Set<string>();

	private readonly asked = new Set<string>();
	private disposed = false;

	constructor(
		private readonly fetchMesh: (ref: string) => Promise<MeshData>,
		private readonly onChange: () => void,
	) {}

	/** Downloads whichever of these models are not here (or on their way) yet. */
	want(refs: Iterable<string>): void {
		for (const ref of refs) {
			if (this.disposed || this.asked.has(ref)) continue;
			this.asked.add(ref);
			this.fetchMesh(ref).then(
				(mesh) => this.put(ref, mesh),
				(error: unknown) => {
					console.warn(`Could not download model ${ref}:`, error);
					this.failed.add(ref);
					if (!this.disposed) this.onChange();
				},
			);
		}
	}

	/** Adds a model that is already in hand, such as one that was just imported. */
	add(ref: string, mesh: MeshData): void {
		this.asked.add(ref);
		this.put(ref, mesh);
	}

	dispose(): void {
		this.disposed = true;
	}

	private put(ref: string, mesh: MeshData): void {
		if (this.disposed) return;
		this.table = new Map(this.table).set(ref, mesh);
		this.onChange();
	}
}
