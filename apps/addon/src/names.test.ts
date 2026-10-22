import { describe, expect, it } from 'vitest';
import { baseName, modelNamesIn, TRIDENT_EXTENSIONS } from './names.ts';

describe('baseName', () => {
	it('is the last part of a path inside a zip', () => {
		expect(baseName('a/b/Part.stl')).toBe('Part.stl');
		expect(baseName('Part.stl')).toBe('Part.stl');
	});
});

describe('modelNamesIn', () => {
	const names = ['images/pic.png', 'files/b.stl', 'files/A.3mf', 'README.md', 'files/', 'c.obj', 'cad/d.STEP', 'e.stp', 'f.svg'];

	it('lists the files Trident can take, by their own names (not their folders), and nothing else', () => {
		expect(modelNamesIn(names, TRIDENT_EXTENSIONS)).toEqual(['files/A.3mf', 'files/b.stl', 'c.obj', 'cad/d.STEP', 'e.stp']);
	});

	it('leaves out what a Mac adds, and hidden files', () => {
		expect(modelNamesIn(['__MACOSX/._a.stl', 'a.stl', '.hidden.stl', 'dir/._b.stl'], TRIDENT_EXTENSIONS)).toEqual(['a.stl']);
	});

	it('is empty when there is nothing it can take', () => {
		expect(modelNamesIn(['a.png', 'b.txt'], TRIDENT_EXTENSIONS)).toEqual([]);
	});
});
