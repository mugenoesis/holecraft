import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerRequest, WorkerResponse } from './geometry.worker.ts';
import { createWorkerEvaluator } from './workerEvaluator.ts';

/** Stands in for the geometry worker: records what it is sent, and the test answers. */
class FakeWorker {
	static made: FakeWorker[] = [];
	sent: WorkerRequest[] = [];
	terminated = false;
	onmessage: ((event: { data: WorkerResponse }) => void) | null = null;
	onerror: ((event: { message: string }) => void) | null = null;
	constructor() {
		FakeWorker.made.push(this);
	}
	postMessage(request: WorkerRequest) {
		this.sent.push(request);
	}
	terminate() {
		this.terminated = true;
	}
	reply(data: WorkerResponse) {
		this.onmessage?.({ data });
	}
}

const subtree = { rootId: 'a', nodes: {} };
const NONE = new Map();

beforeEach(() => {
	FakeWorker.made = [];
	vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe('the geometry worker client', () => {
	it('starts the worker on the first request only, and matches each reply to its request', async () => {
		const client = createWorkerEvaluator();
		expect(FakeWorker.made).toHaveLength(0);
		const shape = client.evaluate(subtree, NONE);
		const edges = client.edges(subtree, NONE);
		const [worker] = FakeWorker.made;
		expect(FakeWorker.made).toHaveLength(1);
		expect(worker!.sent.map((r) => r.kind)).toEqual(['group', 'edges']);
		worker!.reply({ id: worker!.sent[1]!.id, edges: [] });
		worker!.reply({ id: worker!.sent[0]!.id, mesh: null });
		await expect(shape).resolves.toBeNull();
		await expect(edges).resolves.toEqual([]);
	});

	it('turns an error reply, or the wrong kind of reply, into a failure', async () => {
		const client = createWorkerEvaluator();
		const failed = client.edges(subtree, NONE);
		const confused = client.evaluate(subtree, NONE);
		const worker = FakeWorker.made[0]!;
		worker.reply({ id: worker.sent[0]!.id, error: 'not watertight' });
		worker.reply({ id: worker.sent[1]!.id, edges: [] });
		await expect(failed).rejects.toThrow('not watertight');
		await expect(confused).rejects.toThrow('unexpected reply');
	});

	it('fails everything waiting when the worker crashes, then starts a fresh one', async () => {
		const client = createWorkerEvaluator();
		const waiting = client.edges(subtree, NONE);
		FakeWorker.made[0]!.onerror?.({ message: 'out of memory' });
		await expect(waiting).rejects.toThrow('out of memory');
		expect(FakeWorker.made[0]!.terminated).toBe(true);
		void client.evaluate(subtree, NONE).catch(() => {});
		expect(FakeWorker.made).toHaveLength(2);
		client.dispose();
	});
});
