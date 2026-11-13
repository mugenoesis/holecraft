import { beforeAll, describe, expect, it } from 'vitest';
import { buildModel, modelWarnings } from './buildModel.ts';
import { loadManifold } from './load.ts';

let M: Awaited<ReturnType<typeof loadManifold>>;
beforeAll(async () => {
	M = await loadManifold();
});

describe('buildModel', () => {
	it('runs the model, names the design and measures what would be printed', async () => {
		const r = await buildModel(M, 'Tray', (m) => {
			const block = m.add({ type: 'box', size: [60, 40, 30], at: [0, 0, 0] });
			const pocket = m.add({ type: 'box', size: [52, 32, 30], at: [0, 0, 2], hole: true });
			m.group([block, pocket], { name: 'Tray' });
		});
		expect(r.design.name).toBe('Tray');
		expect(r.reports).toHaveLength(1);
		expect(r.reports[0]!.volume).toBeCloseTo(25408, 3);
		expect(r.warnings).toEqual([]);
	});

	it('waits for an async model', async () => {
		const r = await buildModel(M, 'Slow', async (m) => {
			await Promise.resolve();
			m.add({ type: 'box', size: [10, 10, 10] });
		});
		expect(r.reports).toHaveLength(1);
		expect(r.reports[0]!.volume).toBeCloseTo(1000, 3);
	});

	it('uses the id it is given, so a design can be rebuilt in place', async () => {
		const id = 'ab'.repeat(16);
		const r = await buildModel(M, 'X', (m) => void m.add({ type: 'box' }), { id });
		expect(r.design.id).toBe(id);
	});

	it('warns about a hole that is not grouped with a solid, since it cuts nothing', async () => {
		const r = await buildModel(M, 'Loose hole', (m) => {
			m.add({ type: 'box', size: [20, 20, 20] });
			m.add({ type: 'cylinder', size: [5, 5, 30], name: 'Screw hole', hole: true });
		});
		expect(r.warnings.join('\n')).toMatch(/Screw hole.*not grouped/);
	});

	it('warns when nothing would be exported', async () => {
		const r = await buildModel(M, 'Empty', () => {});
		expect(r.reports).toEqual([]);
		expect(r.warnings.join('\n')).toMatch(/nothing/i);
	});

	it('warns about a body whose surface is not closed, naming it and what is wrong', async () => {
		const r = await buildModel(M, 'T', (m) => void m.add({ type: 'box' }));
		const broken = { ...r.reports[0]!, closed: false, problems: ['1 open edge(s): the surface has a hole in it'] };
		expect(modelWarnings(r.design, [broken]).join('\n')).toMatch(/Box 1.*not a closed surface.*open edge/);
	});

	it('lets a refused part reach the caller with its explanation', async () => {
		await expect(buildModel(M, 'Bad', (m) => void m.add({ type: 'box', size: [5000, 1, 1], name: 'Slab' }))).rejects.toThrow(/Slab/);
	});
});
