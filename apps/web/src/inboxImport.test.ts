import { createEmptyDesign, type Design, type MeshShapeInput, nodeBoundsIn } from '@holecraft/core';
import { writeStoredZip } from '@holecraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import {
	baseName,
	buildDesignFrom,
	designNameFor,
	isModelName,
	MAX_AUTO_SELECT,
	modelEntries,
	openInboxFile,
	readingMessage,
	rowLayout,
} from './inboxImport.ts';

const bytes = (s: string) => new TextEncoder().encode(s);
const zip = (names: string[]) => writeStoredZip(names.map((name) => ({ name, data: bytes(name) })));

describe('isModelName', () => {
	it('is true for the model formats the editor reads, in any case', () => {
		for (const n of ['a.stl', 'A.STL', 'b.obj', 'c.3mf', 'd.svg', 'my part.v2.3MF']) expect(isModelName(n), n).toBe(true);
	});

	it('is false for anything else', () => {
		for (const n of ['a.png', 'readme.txt', 'a.stl.txt', 'stl', '.stl', 'a.zip', '']) expect(isModelName(n), n).toBe(false);
	});
});

describe('baseName', () => {
	it('is the last part of a path inside a zip', () => {
		expect(baseName('parts/left/Bracket.stl')).toBe('Bracket.stl');
		expect(baseName('Bracket.stl')).toBe('Bracket.stl');
	});
});

describe('modelEntries', () => {
	it('lists the model files of a zip, in name order, and nothing else', () => {
		const names = ['images/pic.png', 'files/b.stl', 'files/A.3mf', 'README.md', 'files/', 'c.obj'];
		expect(modelEntries(names)).toEqual(['files/A.3mf', 'files/b.stl', 'c.obj']);
	});

	it('leaves out what a Mac adds and hidden files', () => {
		expect(modelEntries(['__MACOSX/._a.stl', 'a.stl', '.hidden.stl', 'dir/.DS_Store', 'dir/._b.stl'])).toEqual(['a.stl']);
	});
});

describe('designNameFor', () => {
	it('is the file’s name without its extension', () => {
		expect(designNameFor('Bracket v2.3mf')).toBe('Bracket v2');
		expect(designNameFor('Parts.zip')).toBe('Parts');
		expect(designNameFor('plain')).toBe('plain');
	});

	it('is a usual name when there is none, and never longer than a design name may be', () => {
		expect(designNameFor('.stl')).toBe('Imported model');
		expect(designNameFor('   ')).toBe('Imported model');
		expect(designNameFor(`${'x'.repeat(300)}.stl`).length).toBeLessThanOrEqual(120);
	});
});

describe('rowLayout', () => {
	it('puts one model in the middle', () => {
		expect(rowLayout([[20, 20, 5]])).toEqual([[0, 0]]);
	});

	it('puts several in a row along x with a gap, centred on the middle of the plate', () => {
		const at = rowLayout(
			[
				[20, 10, 5],
				[30, 10, 5],
				[10, 10, 5],
			],
			10,
		);
		// widths 20 + 30 + 10 and two gaps of 10: 80 across, from -40, so the middles are at -30, 5 and 35
		expect(at.map((p) => p[0])).toEqual([-30, 5, 35]);
		expect(at.every((p) => p[1] === 0)).toBe(true);
	});

	it('is nothing for nothing', () => {
		expect(rowLayout([])).toEqual([]);
	});
});

describe('openInboxFile', () => {
	it('is one model for a model file', async () => {
		const out = await openInboxFile({ name: 'Part.stl', bytes: bytes('x') });
		expect(out).toEqual({ kind: 'models', title: 'Part.stl', files: [{ name: 'Part.stl', bytes: bytes('x') }] });
	});

	it('says what it can read when it is not a model or a zip', async () => {
		await expect(openInboxFile({ name: 'notes.txt', bytes: bytes('x') })).rejects.toThrow(/STL, OBJ, 3MF/);
	});

	it('opens the one model in a zip, named by its own name', async () => {
		const out = await openInboxFile({ name: 'Thing.zip', bytes: zip(['files/Part.stl', 'readme.txt']) });
		expect(out.kind).toBe('models');
		expect(out.files.map((f) => f.name)).toEqual(['Part.stl']);
		expect(out.title).toBe('Thing.zip');
	});

	it('asks which, when a zip holds several', async () => {
		const out = await openInboxFile({ name: 'Thing.zip', bytes: zip(['b.stl', 'a.3mf', 'pic.png']) });
		expect(out.kind).toBe('choose');
		expect(out.files.map((f) => f.name)).toEqual(['a.3mf', 'b.stl']);
	});

	it('keeps the folder in the name when two models in a zip share a name, so they can be told apart', async () => {
		const out = await openInboxFile({ name: 'Thing.zip', bytes: zip(['left/Part.stl', 'right/Part.stl']) });
		expect(out.files.map((f) => f.name)).toEqual(['left/Part.stl', 'right/Part.stl']);
	});

	it('says so when a zip has no model in it, or is not a zip', async () => {
		await expect(openInboxFile({ name: 'Thing.zip', bytes: zip(['pic.png']) })).rejects.toThrow(/no model files/i);
		await expect(openInboxFile({ name: 'Bad.zip', bytes: bytes('not a zip at all') })).rejects.toThrow(/zip/i);
	});

	it('has a limit on how many models are selected at first', () => {
		expect(MAX_AUTO_SELECT).toBe(12);
	});
});

describe('buildDesignFrom', () => {
	const input = (name: string, w: number): MeshShapeInput => ({ name, ref: `${w}`.padStart(64, 'a'), size: [w, 10, 5] });
	const deps = () => {
		const created: string[] = [];
		const saved: Design[] = [];
		return {
			created,
			saved,
			importOne: vi.fn(async (f: { name: string }) => ({
				input: input(f.name, f.name === 'a.stl' ? 20 : 30),
				mesh: { positions: new Float32Array(), indices: new Uint32Array() },
			})),
			create: vi.fn(async (name: string) => {
				created.push(name);
				return createEmptyDesign('0123456789abcdef0123456789abcdef', name);
			}),
			save: vi.fn(async (d: Design) => {
				saved.push(d);
				return d;
			}),
		};
	};

	it('makes a design named for the file, with each model as a shape in a row, and saves it', async () => {
		const d = deps();
		const out = await buildDesignFrom(
			'Parts.zip',
			[
				{ name: 'a.stl', bytes: bytes('1') },
				{ name: 'b.stl', bytes: bytes('2') },
			],
			d,
		);
		expect(d.created).toEqual(['Parts']);
		expect(out.roots).toHaveLength(2);
		const [first, second] = out.roots.map((id) => nodeBoundsIn(out, id)!);
		expect((first!.min[0] + first!.max[0]) / 2).toBeCloseTo(-20, 6);
		expect((second!.min[0] + second!.max[0]) / 2).toBeCloseTo(15, 6);
		expect(d.saved).toEqual([out]);
	});

	it('reports a model that cannot be read, naming it, and saves nothing', async () => {
		const d = deps();
		d.importOne.mockRejectedValueOnce(new Error('There is nothing to import: the file has no usable triangles'));
		await expect(buildDesignFrom('x.zip', [{ name: 'a.stl', bytes: bytes('1') }], d)).rejects.toThrow(/a\.stl.*nothing to import/);
		expect(d.saved).toEqual([]);
		expect(d.created).toEqual([]);
	});
});

describe('readingMessage', () => {
	it('is the usual words for an ordinary file', () => {
		expect(readingMessage(0)).toBe('Opening the model…');
		expect(readingMessage(5 * 1024 * 1024)).toBe('Opening the model…');
	});

	it('says it is big, and how big, when the page is going to be busy for a while', () => {
		expect(readingMessage(95 * 1024 * 1024)).toBe('Reading a large model (95 MB): this can take a little while…');
		expect(readingMessage(20 * 1024 * 1024)).toMatch(/large model \(20 MB\)/);
	});
});
