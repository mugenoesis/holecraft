/*
 * Builds small model files for import tests, separately from the app's own readers and writers.
 * Every cube runs from 0 to `s` in x, y and z, with its triangles facing outwards.
 */
import { deflateRawSync } from 'node:zlib';

const CORNERS = (s: number): number[][] => [
  [0, 0, 0],
  [s, 0, 0],
  [s, s, 0],
  [0, s, 0],
  [0, 0, s],
  [s, 0, s],
  [s, s, s],
  [0, s, s],
];
const FACES: number[][] = [
  [0, 2, 1],
  [0, 3, 2],
  [4, 5, 6],
  [4, 6, 7],
  [0, 1, 5],
  [0, 5, 4],
  [1, 2, 6],
  [1, 6, 5],
  [2, 3, 7],
  [2, 7, 6],
  [3, 0, 4],
  [3, 4, 7],
];

/** A cube with `drop` triangles missing, which leaves holes in its surface. */
const faces = (drop = 0) => FACES.slice(0, FACES.length - drop);

export function cubeStl(s: number, drop = 0): Buffer {
  const tris = faces(drop);
  const out = Buffer.alloc(84 + tris.length * 50);
  out.write('binary cube made by a test', 0, 'latin1');
  out.writeUInt32LE(tris.length, 80);
  const c = CORNERS(s);
  tris.forEach((tri, t) => {
    tri.forEach((corner, k) => c[corner]!.forEach((v, axis) => out.writeFloatLE(v, 84 + t * 50 + 12 + k * 12 + axis * 4)));
  });
  return out;
}

export function cubeAsciiStl(s: number): Buffer {
  const c = CORNERS(s);
  const body = FACES.map((tri) => `facet normal 0 0 0\n outer loop\n${tri.map((i) => `  vertex ${c[i]!.join(' ')}`).join('\n')}\n endloop\nendfacet`).join('\n');
  return Buffer.from(`solid cube\n${body}\nendsolid cube\n`);
}

export function cubeObj(s: number): Buffer {
  const c = CORNERS(s);
  return Buffer.from(`# cube\n${c.map((p) => `v ${p.join(' ')}`).join('\n')}\n${FACES.map((f) => `f ${f.map((i) => i + 1).join(' ')}`).join('\n')}\n`);
}

/** A flat triangle: no thickness, so it cannot be a solid. */
export function flatStl(): Buffer {
  const out = Buffer.alloc(84 + 50);
  out.writeUInt32LE(1, 80);
  [0, 0, 0, 10, 0, 0, 0, 10, 0].forEach((v, i) => out.writeFloatLE(v, 84 + 12 + i * 4));
  return out;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const byte of b) c = CRC[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A zip whose entries are deflate-compressed, as real 3MF files from slicers are. */
function deflatedZip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text);
    const packed = deflateRawSync(data);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** A 3MF holding one cube, with its sides in the given unit (so 2 centimetres is 20 mm). */
export function cube3mf(s: number, unit = 'millimeter'): Buffer {
  const c = CORNERS(s);
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>${c
    .map((p) => `<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`)
    .join('')}</vertices><triangles>${FACES.map((f) => `<triangle v1="${f[0]}" v2="${f[1]}" v3="${f[2]}"/>`).join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  return deflatedZip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    '3D/3dmodel.model': model,
  });
}

/**
 * A 3MF laid out the way OrcaSlicer, Bambu Studio and PrusaSlicer write it: the root model only holds a
 * component that points at the real mesh in 3D/Objects/object_1.model, and the build item places it
 * on the plate (here 100 mm along X). Entries are compressed.
 */
export function slicerPlate3mf(s: number): Buffer {
  const c = CORNERS(s);
  const mesh = `<mesh><vertices>${c.map((p) => `<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`).join('')}</vertices><triangles>${FACES.map((f) => `<triangle v1="${f[0]}" v2="${f[1]}" v3="${f[2]}"/>`).join('')}</triangles></mesh>`;
  const ns = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"';
  return deflatedZip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    '3D/_rels/3dmodel.model.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    '3D/3dmodel.model': `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" ${ns}><resources><object id="2" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components></object></resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 0 0" printable="1"/></build></model>`,
    '3D/Objects/object_1.model': `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" ${ns}><resources><object id="1" type="model">${mesh}</object></resources><build/></model>`,
    'Metadata/model_settings.config': '<?xml version="1.0"?><config><object id="2"><metadata key="name" value="Cube"/></object></config>',
  });
}
