import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extractZipEntry, listZipEntries } from './zip.ts';

/** A zip built here, apart from the code under test: entries are stored or deflated by name, with the sizes in the central directory only. */
function zipOf(entries: { name: string; data: Uint8Array; deflate?: boolean }[]): Uint8Array {
	const parts: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;
	for (const e of entries) {
		const name = Buffer.from(e.name);
		const packed = e.deflate ? deflateRawSync(e.data) : Buffer.from(e.data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0808, 6); // sizes come after the data, as many programs write them
		local.writeUInt16LE(e.deflate ? 8 : 0, 8);
		local.writeUInt16LE(name.length, 26);
		const head = Buffer.alloc(46);
		head.writeUInt32LE(0x02014b50, 0);
		head.writeUInt16LE(20, 4);
		head.writeUInt16LE(20, 6);
		head.writeUInt16LE(0x0808, 8);
		head.writeUInt16LE(e.deflate ? 8 : 0, 10);
		head.writeUInt32LE(packed.length, 20);
		head.writeUInt32LE(e.data.length, 24);
		head.writeUInt16LE(name.length, 28);
		head.writeUInt32LE(offset, 42);
		parts.push(local, name, packed);
		central.push(head, name);
		offset += 30 + name.length + packed.length;
	}
	const directory = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	return new Uint8Array(Buffer.concat([...parts, directory, end]));
}

const bytes = (s: string) => new TextEncoder().encode(s);

describe('listZipEntries', () => {
	it('lists the entries with their names and sizes', () => {
		const zip = zipOf([
			{ name: 'files/a.stl', data: bytes('hello world') },
			{ name: 'readme.txt', data: bytes('hi'), deflate: true },
		]);
		const list = listZipEntries(zip);
		expect(list.map((e) => [e.name, e.size])).toEqual([
			['files/a.stl', 11],
			['readme.txt', 2],
		]);
	});

	it('reads names in UTF-8', () => {
		expect(listZipEntries(zipOf([{ name: 'Étagère.stl', data: bytes('x') }]))[0]?.name).toBe('Étagère.stl');
	});

	it('is an empty list for a zip with nothing in it', () => {
		expect(listZipEntries(zipOf([]))).toEqual([]);
	});

	it('says so when it is not a zip, or is cut short', () => {
		expect(() => listZipEntries(bytes('this is not a zip file at all, just some words'))).toThrow(/zip/i);
		const zip = zipOf([{ name: 'a.stl', data: bytes('hello') }]);
		expect(() => listZipEntries(zip.slice(0, zip.length - 10))).toThrow(/zip/i);
	});
});

describe('extractZipEntry', () => {
	it('gives back what was stored, and what was deflated', async () => {
		const zip = zipOf([
			{ name: 'a.stl', data: bytes('stored data') },
			{ name: 'b.stl', data: bytes('deflated data deflated data deflated data'), deflate: true },
		]);
		const [a, b] = listZipEntries(zip);
		expect(new TextDecoder().decode(await extractZipEntry(zip, a!))).toBe('stored data');
		expect(new TextDecoder().decode(await extractZipEntry(zip, b!))).toBe('deflated data deflated data deflated data');
	});

	it('refuses an entry whose size is not what the directory said', async () => {
		const zip = zipOf([{ name: 'a.stl', data: bytes('hello'), deflate: true }]);
		const [entry] = listZipEntries(zip);
		await expect(extractZipEntry(zip, { ...entry!, size: 99 })).rejects.toThrow(/zip/i);
	});

	it('refuses a compression it does not know', async () => {
		const zip = zipOf([{ name: 'a.stl', data: bytes('hello') }]);
		const [entry] = listZipEntries(zip);
		await expect(extractZipEntry(zip, { ...entry!, method: 14 })).rejects.toThrow(/compress/i);
	});
});
