import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, importMeshFile, parseObj, parseStl, readZip, weldMesh, write3mf, writeObj, writeStl, writeStoredZip } from './index.ts';
import type { ExportBody } from './export.ts';

const text = (s: string) => new TextEncoder().encode(s);

/** A closed unit-ish tetrahedron: 4 corners, 4 triangles. */
const tetra = {
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
};
const body = (name = 'Tetra', mesh = tetra): ExportBody => ({ name, color: '#f28c28', mesh });

function volume(m: { positions: Float32Array; indices: Uint32Array }): number {
  let v = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const p = [0, 1, 2].map((k) => [...m.positions.subarray(m.indices[t + k]! * 3, m.indices[t + k]! * 3 + 3)]) as number[][];
    const [a, b, c] = p as [number[], number[], number[]];
    v += (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6;
  }
  return v;
}

describe('weldMesh', () => {
  it('merges corners at the same place and renumbers the triangles', () => {
    // two triangles of a square, each with its own copy of the shared corners
    const welded = weldMesh(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), new Uint32Array([0, 1, 2, 3, 4, 5]));
    expect(welded.positions.length / 3).toBe(4);
    expect(welded.indices.length).toBe(6);
  });

  it('drops triangles that collapse to a line or point', () => {
    const welded = weldMesh(new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint32Array([0, 1, 2, 0, 1, 3]));
    expect(welded.indices.length).toBe(3);
  });

  it('keeps tiny but real differences apart', () => {
    const welded = weldMesh(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.001]), new Uint32Array([0, 1, 2, 0, 2, 3]));
    expect(welded.positions.length / 3).toBe(4);
  });
});

describe('parseStl', () => {
  it('reads what writeStl wrote, joining corners shared between triangles', () => {
    const mesh = parseStl(writeStl([body()]));
    expect(mesh.positions.length / 3).toBe(4);
    expect(mesh.indices.length).toBe(12);
    expect(volume(mesh)).toBeCloseTo(volume(tetra), 4);
  });

  it('reads the text form', () => {
    const ascii = `solid t
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 10 0 0
      vertex 0 10 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 10 0 0
      vertex 10 10 1e0
      vertex 0 10 0
    endloop
  endfacet
endsolid t
`;
    const mesh = parseStl(text(ascii));
    expect(mesh.indices.length).toBe(6);
    expect(mesh.positions.length / 3).toBe(4);
    expect(mesh.positions).toContain(10);
  });

  it('treats a binary file whose header starts with "solid" as binary', () => {
    const bytes = writeStl([body()]);
    bytes.set(text('solid exported by something'), 0);
    expect(parseStl(bytes).indices.length).toBe(12);
  });

  it('rejects files that are not STL', () => {
    expect(() => parseStl(text('hello'))).toThrow(/STL/);
    expect(() => parseStl(new Uint8Array(100))).toThrow(/STL/);
  });

  it('rejects a binary file whose size does not match its triangle count', () => {
    const bytes = writeStl([body()]);
    expect(() => parseStl(bytes.subarray(0, bytes.length - 10))).toThrow(/STL/);
  });
});

describe('parseObj', () => {
  it('reads what writeObj wrote', () => {
    const mesh = parseObj(writeObj([body()]));
    expect(mesh.positions.length / 3).toBe(4);
    expect(volume(mesh)).toBeCloseTo(volume(tetra), 4);
  });

  it('understands v/vt/vn faces, negative indices and comments', () => {
    const mesh = parseObj('# hi\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvn 0 0 1\nf 1/1/1 2/1/1 3/1/1\nf -3 -2 -1\n');
    expect(mesh.indices.length).toBe(6);
    expect(mesh.positions.length / 3).toBe(3);
  });

  it('splits quads and bigger polygons into triangles', () => {
    const mesh = parseObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n');
    expect(mesh.indices.length).toBe(6);
  });

  it('joins several objects into one mesh', () => {
    const mesh = parseObj('o a\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\no b\nv 5 0 0\nv 6 0 0\nv 5 1 0\nf 4 5 6\n');
    expect(mesh.indices.length).toBe(6);
    expect(mesh.positions.length / 3).toBe(6);
  });

  it('rejects a face that points at a vertex that does not exist', () => {
    expect(() => parseObj('v 0 0 0\nf 1 2 3\n')).toThrow(/OBJ/);
  });

  it('rejects a file with no faces', () => {
    expect(() => parseObj('v 0 0 0\n')).toThrow(/OBJ/);
  });
});

describe('readZip', () => {
  it('reads stored entries', async () => {
    const zip = writeStoredZip([{ name: 'a.txt', data: text('hello') }]);
    const files = await readZip(zip);
    expect(new TextDecoder().decode(files.get('a.txt'))).toBe('hello');
  });

  it('reads deflate-compressed entries, as most real 3MF files are', async () => {
    const data = text('hello hello hello hello hello hello');
    const packed = new Uint8Array(deflateRawSync(data));
    // a zip with one deflated entry, built by hand
    const name = text('a.txt');
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc32(data), true);
    lv.setUint32(18, packed.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc32(data), true);
    cv.setUint32(20, packed.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    central.set(name, 46);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true);
    ev.setUint32(16, local.length + packed.length, true);
    const zip = new Uint8Array([...local, ...packed, ...central, ...end]);

    const files = await readZip(zip);
    expect(new TextDecoder().decode(files.get('a.txt'))).toBe('hello hello hello hello hello hello');
  });

  it('rejects something that is not a zip', async () => {
    await expect(readZip(text('not a zip at all, just words and words and words'))).rejects.toThrow(/zip/i);
  });
});

describe('importMeshFile', () => {
  it('names the shape after the file, without its extension', async () => {
    const mesh = await importMeshFile('My Part.stl', writeStl([body()]));
    expect(mesh.name).toBe('My Part');
  });

  it('reads a 3MF written by write3mf', async () => {
    const mesh = await importMeshFile('x.3mf', write3mf([body()]));
    expect(volume(mesh)).toBeCloseTo(volume(tetra), 4);
  });

  it('joins several 3MF objects into one mesh', async () => {
    const far = { positions: tetra.positions.map((v, i) => (i % 3 === 0 ? v + 100 : v)), indices: tetra.indices };
    const mesh = await importMeshFile('x.3mf', write3mf([body('A'), body('B', far)]));
    expect(mesh.indices.length).toBe(24);
    expect(volume(mesh)).toBeCloseTo(2 * volume(tetra), 3);
  });

  it('converts units in a 3MF to millimetres', async () => {
    const zip = writeStoredZip([
      { name: '3D/3dmodel.model', data: text('<?xml version="1.0"?><model unit="centimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="0" v2="3" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>') },
    ]);
    const mesh = await importMeshFile('x.3mf', zip);
    expect(Math.max(...mesh.positions)).toBe(10);
  });

  it('applies a build transform in a 3MF', async () => {
    const zip = writeStoredZip([
      { name: '3D/3dmodel.model', data: text('<model unit="millimeter"><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 50 0 0"/></build></model>') },
    ]);
    const mesh = await importMeshFile('x.3mf', zip);
    expect(Math.min(...[0, 3, 6].map((i) => mesh.positions[i]!))).toBe(50);
  });

  describe('3MF files whose parts live in other files (OrcaSlicer, Bambu Studio, PrusaSlicer)', () => {
    const TET = '<vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="0" v2="3" v3="2"/></triangles>';
    const partFile = (id: number) => `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="${id}" type="model"><mesh>${TET}</mesh></object></resources><build/></model>`;
    const root = (resources: string, build: string) =>
      `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"><resources>${resources}</resources><build>${build}</build></model>`;

    it('follows a component to the model file it names', async () => {
      const zip = writeStoredZip([
        { name: '3D/3dmodel.model', data: text(root('<object id="2" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1"/></components></object>', '<item objectid="2"/>')) },
        { name: '3D/Objects/object_1.model', data: text(partFile(1)) },
      ]);
      const mesh = await importMeshFile('plate.3mf', zip);
      expect(mesh.indices.length).toBe(12);
      expect(volume(mesh)).toBeCloseTo(volume(tetra) / 1, 3);
    });

    it('applies the transforms on the component and on the build item', async () => {
      const zip = writeStoredZip([
        {
          name: '3D/3dmodel.model',
          data: text(
            root(
              '<object id="2" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 5 0 0"/></components></object>',
              '<item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 0 0"/>',
            ),
          ),
        },
        { name: '3D/Objects/object_1.model', data: text(partFile(1)) },
      ]);
      const mesh = await importMeshFile('plate.3mf', zip);
      expect(Math.min(...[...mesh.positions].filter((_, i) => i % 3 === 0))).toBe(105);
    });

    it('joins several parts, even when each file numbers its objects from 1', async () => {
      const zip = writeStoredZip([
        {
          name: '3D/3dmodel.model',
          data: text(
            root(
              '<object id="3" type="model"><components><component p:path="/3D/Objects/a.model" objectid="1"/><component p:path="/3D/Objects/b.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 50 0 0"/></components></object>',
              '<item objectid="3"/>',
            ),
          ),
        },
        { name: '3D/Objects/a.model', data: text(partFile(1)) },
        { name: '3D/Objects/b.model', data: text(partFile(1)) },
      ]);
      const mesh = await importMeshFile('plate.3mf', zip);
      expect(mesh.indices.length).toBe(24);
    });

    it('says so when a component points at a file that is not in the package', async () => {
      const zip = writeStoredZip([
        { name: '3D/3dmodel.model', data: text(root('<object id="2"><components><component p:path="/3D/Objects/missing.model" objectid="1"/></components></object>', '<item objectid="2"/>')) },
      ]);
      await expect(importMeshFile('plate.3mf', zip)).rejects.toThrow(/missing\.model/);
    });

    it('ignores other files in the package, such as thumbnails and settings', async () => {
      const zip = writeStoredZip([
        { name: '3D/3dmodel.model', data: text(root(`<object id="1" type="model"><mesh>${TET}</mesh></object>`, '<item objectid="1"/>')) },
        { name: 'Metadata/plate_1.png', data: new Uint8Array([137, 80, 78, 71]) },
        { name: 'Metadata/model_settings.config', data: text('<config/>') },
      ]);
      expect((await importMeshFile('x.3mf', zip)).indices.length).toBe(12);
    });
  });

  it('rejects unknown file types', async () => {
    await expect(importMeshFile('x.png', text('x'))).rejects.toThrow(/STL, OBJ or 3MF/);
  });

  it('rejects a 3MF with no model inside', async () => {
    await expect(importMeshFile('x.3mf', writeStoredZip([{ name: 'a.txt', data: text('x') }]))).rejects.toThrow(/3MF/);
  });

  it('refuses meshes with more triangles than we can handle', async () => {
    const big = new Uint8Array(84 + 50);
    new DataView(big.buffer).setUint32(80, 5_000_000, true);
    await expect(importMeshFile('x.stl', big)).rejects.toThrow(/STL|large/i);
  });
});
