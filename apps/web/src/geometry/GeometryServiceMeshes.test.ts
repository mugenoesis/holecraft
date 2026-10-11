import { addMeshShape, addShape, createEmptyDesign, type Design, groupNodes, type MeshData } from '@holecraft/core';
import type { GroupMesh } from '@holecraft/geometry';
import { beforeEach, describe, expect, it } from 'vitest';
import { GeometryService } from './GeometryService.ts';

const REF = 'e'.repeat(64);
const data = (): MeshData => ({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) });
const flush = () => new Promise((r) => setTimeout(r, 0));

let calls: { rootId: string; meshes: ReadonlyMap<string, MeshData> }[];
let service: GeometryService;

beforeEach(() => {
	calls = [];
	service = new GeometryService(
		async (subtree, meshes) => {
			calls.push({ rootId: subtree.rootId, meshes });
			return { positions: new Float32Array(3), indices: new Uint32Array(3) } as GroupMesh;
		},
		() => undefined,
	);
});

function importedGroup(): Design {
	let d = createEmptyDesign('d');
	d = addMeshShape(d, { name: 'Part', ref: REF, size: [10, 10, 10] }, { id: 'm' }).design;
	d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
	return groupNodes(d, ['m', 'h'], { id: 'g' }).design;
}

describe('GeometryService with imported models', () => {
	it('waits for the models a group needs before working it out', async () => {
		service.update(importedGroup(), new Map());
		await flush();
		expect(calls).toHaveLength(0);
		expect(service.failed().size).toBe(0);
		expect(service.busy).toBe(false);
	});

	it('works the group out once its models have arrived, handing them over', async () => {
		const table = new Map([[REF, data()]]);
		service.update(importedGroup(), new Map());
		service.update(importedGroup(), table);
		await flush();
		expect(calls).toHaveLength(1);
		expect(calls[0]!.meshes.get(REF)).toBe(table.get(REF));
		expect(service.results().get('g')).toBeDefined();
	});

	it('hands over only the models that group uses', async () => {
		const table = new Map([
			[REF, data()],
			['f'.repeat(64), data()],
		]);
		service.update(importedGroup(), table);
		await flush();
		expect([...calls[0]!.meshes.keys()]).toEqual([REF]);
	});

	it('does not need models for groups of ordinary shapes', async () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
		d = groupNodes(d, ['a', 'h'], { id: 'g' }).design;
		service.update(d);
		await flush();
		expect(calls).toHaveLength(1);
	});
});
