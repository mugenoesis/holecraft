import { addMeshShape, addShape, createEmptyDesign, type Design, type MeshData, type MeshHealth } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModelCheckPanel } from './ModelCheckPanel.tsx';
import { selectedModel, type useModelCheck } from './useModelCheck.ts';

type Check = ReturnType<typeof useModelCheck>;

const REF = 'a'.repeat(64);
const mesh: MeshData = { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) };
const healthy: MeshHealth = {
	triangles: 12,
	openEdges: 0,
	nonManifoldEdges: 0,
	flippedEdges: 0,
	degenerate: 0,
	insideOut: 0,
	closed: true,
};
const model = { id: 'm', ref: REF, mesh };

const check = (extra: Partial<Check>): Check => ({
	model,
	health: healthy,
	busy: false,
	note: null,
	error: null,
	repair: async () => {},
	...extra,
});
const render = (c: Check) => renderToStaticMarkup(createElement(ModelCheckPanel, { check: c }));

describe('ModelCheckPanel', () => {
	it('is nothing when no imported model is selected', () => {
		expect(render(check({ model: null, health: null }))).toBe('');
	});

	it('says a closed model is closed and offers no repair', () => {
		const html = render(check({}));
		expect(html).toContain('aria-label="Model check"');
		expect(html).toContain('Closed surface (12 triangles)');
		expect(html).not.toContain('Repair');
	});

	it('lists what is wrong and offers a repair for what can be mended', () => {
		const html = render(check({ health: { ...healthy, closed: false, openEdges: 3 } }));
		expect(html).toContain('3 open edges');
		expect(html).toContain('>Repair<');
		expect(html).not.toContain('cannot mend this by itself');
	});

	it('says so when the only fault cannot be mended automatically', () => {
		const html = render(check({ health: { ...healthy, closed: false, nonManifoldEdges: 2 } }));
		expect(html).not.toContain('>Repair<');
		expect(html).toContain('cannot mend this by itself');
	});

	it('says a repair is under way, what it did, and why it failed', () => {
		const faulty = { ...healthy, closed: false, openEdges: 3 };
		expect(render(check({ health: faulty, busy: true }))).toContain('Repairing…');
		expect(render(check({ note: 'Repaired: filled 1 hole.' }))).toContain('Repaired: filled 1 hole.');
		const failed = render(check({ error: 'The server is not there' }));
		expect(failed).toContain('role="alert"');
		expect(failed).toContain('The server is not there');
	});
});

describe('selectedModel', () => {
	const design = (): Design => {
		let d = createEmptyDesign('d');
		d = addMeshShape(d, { name: 'Part', ref: REF, size: [1, 1, 1] }, { id: 'm' }).design;
		d = addShape(d, 'box', [50, 0], { id: 'b' }).design;
		return d;
	};
	const meshes = new Map([[REF, mesh]]);

	it('is the one imported model that is selected, with its mesh', () => {
		expect(selectedModel(design(), ['m'], meshes)).toEqual({ id: 'm', ref: REF, mesh });
	});

	it('is nothing for a shape that is not a model, several selected, none, or a model whose mesh has not arrived', () => {
		expect(selectedModel(design(), ['b'], meshes)).toBeNull();
		expect(selectedModel(design(), ['m', 'b'], meshes)).toBeNull();
		expect(selectedModel(design(), [], meshes)).toBeNull();
		expect(selectedModel(design(), ['m'], new Map())).toBeNull();
	});
});
