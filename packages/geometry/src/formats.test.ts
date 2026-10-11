import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ExportBody } from './export.ts';
import { exportFileName } from './filename.ts';
import { writeObj } from './formats/obj.ts';
import { writeStl } from './formats/stl.ts';
import { write3mf } from './formats/threemf.ts';
import { crc32 as ownCrc32, readStoredZip } from './formats/zip.ts';

/** A unit tetrahedron-ish body: 4 vertices, 4 triangles, counter-clockwise from outside. */
function tetra(name = 'Tetra', color = '#ff8800', dx = 0): ExportBody {
	const v = [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10].map((n, i) => (i % 3 === 0 ? n + dx : n));
	return {
		name,
		color,
		mesh: { positions: new Float32Array(v), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) },
	};
}

describe('writeStl', () => {
	it('writes the binary layout: 80-byte header, a count, then 50 bytes a triangle', () => {
		const bytes = writeStl([tetra()]);
		expect(bytes.byteLength).toBe(80 + 4 + 4 * 50);
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		expect(view.getUint32(80, true)).toBe(4);
		// The header must not start with "solid", or some programs mistake the file for ASCII STL.
		expect(new TextDecoder().decode(bytes.subarray(0, 5))).not.toBe('solid');
	});

	it("stores each triangle's unit normal and corners", () => {
		const view = new DataView(writeStl([tetra()]).buffer);
		// Triangle 0 is (0,0,0) (0,10,0) (10,0,0): flat on the floor, facing down.
		expect([0, 1, 2].map((i) => view.getFloat32(84 + i * 4, true))).toEqual([0, 0, -1]);
		expect([3, 4, 5].map((i) => view.getFloat32(84 + i * 4, true))).toEqual([0, 0, 0]);
		expect([6, 7, 8].map((i) => view.getFloat32(84 + i * 4, true))).toEqual([0, 10, 0]);
		expect([9, 10, 11].map((i) => view.getFloat32(84 + i * 4, true))).toEqual([10, 0, 0]);
	});

	it('joins several bodies into one file', () => {
		const bytes = writeStl([tetra('a'), tetra('b', '#000000', 20)]);
		expect(new DataView(bytes.buffer).getUint32(80, true)).toBe(8);
		expect(bytes.byteLength).toBe(84 + 8 * 50);
	});

	it('refuses to write nothing', () => {
		expect(() => writeStl([])).toThrow(/nothing to export/i);
	});

	it('writes a zero normal for a degenerate triangle instead of NaN', () => {
		const body: ExportBody = {
			name: 'flat',
			color: '#000000',
			mesh: { positions: new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]), indices: new Uint32Array([0, 1, 2]) },
		};
		const view = new DataView(writeStl([body]).buffer);
		expect([0, 1, 2].map((i) => view.getFloat32(84 + i * 4, true))).toEqual([0, 0, 0]);
	});
});

describe('writeObj', () => {
	const lines = (text: string) => text.split('\n').filter(Boolean);

	it('writes millimetre units, an object per body, vertices and 1-based faces', () => {
		const text = writeObj([tetra('Plate')]);
		const l = lines(text);
		expect(l[0]).toMatch(/^# .*Holecraft/i);
		expect(text).toMatch(/units: mm/i);
		expect(l).toContain('o Plate');
		expect(l.filter((x) => x.startsWith('v '))).toHaveLength(4);
		expect(l.filter((x) => x.startsWith('f '))).toEqual(['f 1 3 2', 'f 1 2 4', 'f 2 3 4', 'f 1 4 3']);
	});

	it('numbers the vertices of later bodies after those of earlier ones', () => {
		const l = lines(writeObj([tetra('a'), tetra('b', '#000', 20)]));
		const faces = l.filter((x) => x.startsWith('f '));
		expect(faces).toHaveLength(8);
		expect(faces[4]).toBe('f 5 7 6');
		expect(l.filter((x) => x.startsWith('v '))[4]).toBe('v 20 0 0');
	});

	it('keeps a body name from breaking the file', () => {
		const text = writeObj([tetra('Evil\nv 9 9 9\r\nname')]);
		expect(lines(text).filter((x) => x.startsWith('v '))).toHaveLength(4);
		expect(lines(text).some((x) => x.startsWith('o '))).toBe(true);
	});

	it('writes numbers plainly, without exponents', () => {
		const body = tetra();
		body.mesh.positions[3] = 0.00001234;
		expect(writeObj([body])).not.toMatch(/e-?\d/i);
	});

	it('refuses to write nothing', () => {
		expect(() => writeObj([])).toThrow(/nothing to export/i);
	});
});

describe('write3mf', () => {
	const decode = (bytes: Uint8Array, name: string) => new TextDecoder().decode(readStoredZip(bytes).get(name));

	it('is a zip holding the three parts every 3MF needs', () => {
		const files = readStoredZip(write3mf([tetra()]));
		expect([...files.keys()].sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
	});

	it('starts with the zip signature and has valid checksums', () => {
		const bytes = write3mf([tetra()]);
		expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
		// readStoredZip checks each entry's CRC-32 against the data; compare ours with node's own too.
		for (const [, data] of readStoredZip(bytes)) expect(ownCrc32(data)).toBe(crc32(data));
		expect(ownCrc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926); // the standard CRC-32 check value
	});

	it('declares millimetres and lists each body as an object with its vertices and triangles', () => {
		const xml = decode(write3mf([tetra('Plate'), tetra('Lid', '#00ff00', 20)]), '3D/3dmodel.model');
		expect(xml).toContain('unit="millimeter"');
		expect(xml.match(/<object /g)).toHaveLength(2);
		expect(xml.match(/<vertex /g)).toHaveLength(8);
		expect(xml.match(/<triangle /g)).toHaveLength(8);
		expect(xml).toContain('name="Plate"');
		expect(xml).toContain('name="Lid"');
		expect(xml.match(/<item /g)).toHaveLength(2);
	});

	it("keeps each body's colour", () => {
		const xml = decode(write3mf([tetra('a', '#ff8800'), tetra('b', '#00ff88')]), '3D/3dmodel.model');
		expect(xml).toContain('displaycolor="#FF8800FF"');
		expect(xml).toContain('displaycolor="#00FF88FF"');
	});

	it('numbers triangle corners from zero within each object', () => {
		const xml = decode(write3mf([tetra('a'), tetra('b', '#000', 20)]), '3D/3dmodel.model');
		const triangles = [...xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map((m) => [
			Number(m[1]),
			Number(m[2]),
			Number(m[3]),
		]);
		expect(Math.max(...triangles.flat())).toBe(3);
	});

	it('escapes names so they cannot break the XML', () => {
		const xml = decode(write3mf([tetra('A & B <"x">')]), '3D/3dmodel.model');
		expect(xml).toContain('name="A &amp; B &lt;&quot;x&quot;&gt;"');
	});

	it('refuses to write nothing', () => {
		expect(() => write3mf([])).toThrow(/nothing to export/i);
	});
});

describe('readStoredZip', () => {
	it('rejects data that is not a zip, or has a damaged entry', () => {
		expect(() => readStoredZip(new Uint8Array([1, 2, 3, 4]))).toThrow();
		const bytes = write3mf([tetra()]);
		const damaged = new Uint8Array(bytes);
		damaged[60] = (damaged[60]! + 1) & 0xff; // flip a byte inside the first entry's data
		expect(() => readStoredZip(damaged)).toThrow(/checksum|crc/i);
	});
});

describe('exportFileName', () => {
	it('adds the extension to the design name', () => {
		expect(exportFileName('Bracket', 'stl')).toBe('Bracket.stl');
		expect(exportFileName('My Gear', '3MF')).toBe('My Gear.3mf');
	});

	it('replaces characters that are not allowed in file names', () => {
		expect(exportFileName('a/b\\c:d*e?f"g<h>i|j', 'stl')).toBe('a-b-c-d-e-f-g-h-i-j.stl');
	});

	it('removes control characters, collapses spaces and trims dots and spaces from the ends', () => {
		expect(exportFileName('  hi\u0000\n   there.. ', 'obj')).toBe('hi there.obj');
	});

	it('falls back to a plain name when nothing usable is left', () => {
		expect(exportFileName('', 'stl')).toBe('design.stl');
		expect(exportFileName('///', 'stl')).toBe('design.stl');
		expect(exportFileName('...', 'stl')).toBe('design.stl');
	});

	it('keeps the name a sensible length', () => {
		expect(exportFileName('x'.repeat(500), 'stl').length).toBeLessThanOrEqual(84);
	});

	it('avoids names Windows reserves', () => {
		expect(exportFileName('CON', 'stl')).toBe('CON-design.stl');
		expect(exportFileName('nul', 'stl')).toBe('nul-design.stl');
	});

	it('avoids reserved names even when something follows a dot, which Windows still treats as the device', () => {
		expect(exportFileName('con.txt', 'stl')).toBe('con-design.txt.stl');
		expect(exportFileName('NUL.final', 'obj')).toBe('NUL-design.final.obj');
		expect(exportFileName('COM1', '3mf')).toBe('COM1-design.3mf');
		expect(exportFileName('lpt9.v2', 'stl')).toBe('lpt9-design.v2.stl');
	});

	it('avoids the superscript-digit device names too', () => {
		expect(exportFileName('COM¹', 'stl')).toBe('COM¹-design.stl');
		expect(exportFileName('lpt³.x', 'stl')).toBe('lpt³-design.x.stl');
	});

	it('leaves names that merely start with a reserved word alone', () => {
		expect(exportFileName('console', 'stl')).toBe('console.stl');
		expect(exportFileName('connector.v2', 'stl')).toBe('connector.v2.stl');
		expect(exportFileName('com10', 'stl')).toBe('com10.stl');
		expect(exportFileName('my con', 'stl')).toBe('my con.stl');
	});
});
