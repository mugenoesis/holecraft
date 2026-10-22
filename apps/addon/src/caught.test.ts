import { beforeEach, describe, expect, it } from 'vitest';
import { CaughtFiles } from './caught.ts';

let clock: number;
let files: CaughtFiles;
const MIN = 60_000;
const entry = (name: string, size = 3, over: Record<string, unknown> = {}) => ({
	name,
	kind: 'model' as const,
	size,
	url: `https://cdn.example.com/${name}`,
	site: 'MakerWorld',
	bytes: new Uint8Array(size),
	...over,
});

beforeEach(() => {
	clock = 1_000_000;
	files = new CaughtFiles({ now: () => clock, maxFiles: 3, maxBytes: 100, maxAge: 30 * MIN });
});

describe('CaughtFiles', () => {
	it('keeps a file and lists it without its bytes, newest first', () => {
		const a = files.add(entry('a.stl'));
		clock += 1000;
		const b = files.add(entry('b.stl'));
		expect(files.list().map((f) => f.id)).toEqual([b, a]);
		expect(files.list()[0]).toEqual({ id: b, name: 'b.stl', kind: 'model', size: 3, site: 'MakerWorld', at: clock, ready: true });
		expect(JSON.stringify(files.list())).not.toContain('bytes');
	});

	it('gives a file back whole, with where it came from, or null', () => {
		const id = files.add(entry('a.stl'));
		expect(files.get(id)?.url).toBe('https://cdn.example.com/a.stl');
		expect(files.get(id)?.bytes).toHaveLength(3);
		expect(files.get('nope')).toBeNull();
	});

	it('says a file is not ready when only its address is known (the bytes could not be copied)', () => {
		files.add(entry('a.stl', 3, { bytes: null }));
		expect(files.list()[0]?.ready).toBe(false);
	});

	it('removes a file', () => {
		const id = files.add(entry('a.stl'));
		files.remove(id);
		expect(files.list()).toEqual([]);
		files.remove(id);
	});

	it('forgets the files that came from an address', () => {
		files.add(entry('a.stl'));
		files.add(entry('b.stl'));
		files.removeByUrl('https://cdn.example.com/a.stl');
		expect(files.list().map((f) => f.name)).toEqual(['b.stl']);
	});

	it('forgets a file after the time it is given', () => {
		files.add(entry('a.stl'));
		clock += 31 * MIN;
		expect(files.list()).toEqual([]);
		expect(files.count()).toBe(0);
	});

	it('keeps at most the number of files it is given, dropping the oldest', () => {
		const ids = ['a', 'b', 'c', 'd'].map((n) => {
			clock += 1000;
			return files.add(entry(`${n}.stl`));
		});
		expect(files.list().map((f) => f.id)).toEqual([ids[3], ids[2], ids[1]]);
	});

	it('keeps at most the bytes it is given in all, dropping the oldest', () => {
		const a = files.add(entry('a.stl', 60));
		clock += 1000;
		const b = files.add(entry('b.stl', 60));
		expect(files.get(a)?.bytes).toBeNull(); // the older one keeps its place in the list, but not its bytes, so it is fetched again if wanted
		expect(files.get(b)?.bytes).toHaveLength(60);
		expect(files.list().find((f) => f.id === a)?.ready).toBe(false);
	});

	it('keeps only the address of a file that is bigger than all it may hold', () => {
		const id = files.add(entry('big.stl', 500));
		expect(files.get(id)?.bytes).toBeNull();
		expect(files.list()[0]?.ready).toBe(false);
	});

	it('counts how many are waiting', () => {
		expect(files.count()).toBe(0);
		files.add(entry('a.stl'));
		files.add(entry('b.stl'));
		expect(files.count()).toBe(2);
	});
});
