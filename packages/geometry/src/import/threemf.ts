import { readZip } from '../formats/zip.ts';
import { MAX_IMPORT_TRIANGLES, weldMesh, type RawMesh } from './weld.ts';

const decoder = new TextDecoder();

/** Millimetres in one of each unit a 3MF file may use. */
const UNIT_MM: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, meter: 1000, inch: 25.4, foot: 304.8 };

/** A 3MF transform: twelve numbers, a 3x3 matrix then a shift, applied to row vectors. */
type Transform = readonly number[];
const IDENTITY: Transform = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const MAX_NESTING = 8;

interface ObjectData {
  vertices: number[];
  triangles: number[];
  components: { objectId: string; transform: Transform }[];
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(tag)?.[1];

function transformOf(tag: string): Transform {
  const text = attr(tag, 'transform');
  if (!text) return IDENTITY;
  const t = text.trim().split(/\s+/).map(Number);
  if (t.length !== 12 || t.some((n) => !Number.isFinite(n))) throw new Error('This 3MF has an invalid transform');
  return t;
}

/** The single transform that does `inner` first and then `outer`. */
function compose(inner: Transform, outer: Transform): Transform {
  // each row of the 3x3 part (and the shift) of `inner`, pushed through `outer`'s matrix
  const through = (x: number, y: number, z: number) => [
    x * outer[0]! + y * outer[3]! + z * outer[6]!,
    x * outer[1]! + y * outer[4]! + z * outer[7]!,
    x * outer[2]! + y * outer[5]! + z * outer[8]!,
  ];
  const [sx, sy, sz] = through(inner[9]!, inner[10]!, inner[11]!);
  return [
    ...through(inner[0]!, inner[1]!, inner[2]!),
    ...through(inner[3]!, inner[4]!, inner[5]!),
    ...through(inner[6]!, inner[7]!, inner[8]!),
    sx! + outer[9]!,
    sy! + outer[10]!,
    sz! + outer[11]!,
  ];
}

/** Reads a 3MF: every object in its build list, with transforms and the file's units applied, joined into one mesh. */
export async function parse3mf(bytes: Uint8Array): Promise<RawMesh> {
  const files = await readZip(bytes).catch((e: unknown) => {
    throw new Error(`This is not a valid 3MF file (${e instanceof Error ? e.message : 'unreadable'})`);
  });
  const modelName = files.has('3D/3dmodel.model') ? '3D/3dmodel.model' : [...files.keys()].find((n) => n.toLowerCase().endsWith('.model'));
  if (!modelName) throw new Error('This 3MF has no model inside');
  const xml = decoder.decode(files.get(modelName)!);

  const scale = UNIT_MM[attr(/<(?:\w+:)?model\b[^>]*>/.exec(xml)?.[0] ?? '', 'unit') ?? 'millimeter'];
  if (scale === undefined) throw new Error('This 3MF uses an unknown unit');

  const objects = new Map<string, ObjectData>();
  for (const m of xml.matchAll(/<(?:\w+:)?object\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?object>/g)) {
    const id = attr(m[1]!, 'id');
    if (id === undefined || attr(m[1]!, 'type') === 'support') continue;
    const body = m[2]!;
    const data: ObjectData = { vertices: [], triangles: [], components: [] };
    for (const v of body.matchAll(/<(?:\w+:)?vertex\b([^>]*?)\/?>/g)) {
      data.vertices.push(Number(attr(v[1]!, 'x')), Number(attr(v[1]!, 'y')), Number(attr(v[1]!, 'z')));
    }
    for (const t of body.matchAll(/<(?:\w+:)?triangle\b([^>]*?)\/?>/g)) {
      data.triangles.push(Number(attr(t[1]!, 'v1')), Number(attr(t[1]!, 'v2')), Number(attr(t[1]!, 'v3')));
    }
    for (const c of body.matchAll(/<(?:\w+:)?component\b([^>]*?)\/?>/g)) {
      const objectId = attr(c[1]!, 'objectid');
      if (objectId !== undefined) data.components.push({ objectId, transform: transformOf(c[1]!) });
    }
    if (data.vertices.some((n) => !Number.isFinite(n)) || data.triangles.some((n) => !Number.isInteger(n) || n < 0 || n * 3 >= data.vertices.length)) {
      throw new Error('This 3MF has a damaged mesh');
    }
    objects.set(id, data);
  }

  let items = [...xml.matchAll(/<(?:\w+:)?item\b([^>]*?)\/?>/g)].map((m) => ({ objectId: attr(m[1]!, 'objectid'), transform: transformOf(m[1]!) }));
  if (items.length === 0) items = [...objects.keys()].map((objectId) => ({ objectId, transform: IDENTITY }));

  const positions: number[] = [];
  const indices: number[] = [];
  const place = (objectId: string | undefined, transform: Transform, depth: number): void => {
    const object = objectId === undefined ? undefined : objects.get(objectId);
    if (!object) return;
    if (depth > MAX_NESTING) throw new Error('This 3MF nests its parts too deeply');
    const base = positions.length / 3;
    for (let i = 0; i < object.vertices.length; i += 3) {
      const [x, y, z] = [object.vertices[i]!, object.vertices[i + 1]!, object.vertices[i + 2]!];
      positions.push(
        (x * transform[0]! + y * transform[3]! + z * transform[6]! + transform[9]!) * scale,
        (x * transform[1]! + y * transform[4]! + z * transform[7]! + transform[10]!) * scale,
        (x * transform[2]! + y * transform[5]! + z * transform[8]! + transform[11]!) * scale,
      );
    }
    for (const v of object.triangles) indices.push(base + v);
    if (indices.length / 3 > MAX_IMPORT_TRIANGLES) throw new Error('This 3MF is too large');
    for (const c of object.components) place(c.objectId, compose(c.transform, transform), depth + 1);
  };
  for (const item of items) place(item.objectId, item.transform, 0);

  if (indices.length === 0) throw new Error('This 3MF has no shapes in it');
  return weldMesh(new Float32Array(positions), new Uint32Array(indices));
}
