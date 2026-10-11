import type { ExportBody } from '../export.ts';
import { formatNumber, oneLine, requireBodies } from './shared.ts';
import { writeStoredZip } from './zip.ts';

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;

const RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

/** The material id used for the shared list of body colours; objects take the ids after it. */
const MATERIALS_ID = 1;

/** A 3MF file: one object per body (named, coloured), in millimetres. */
export function write3mf(bodies: readonly ExportBody[]): Uint8Array {
  requireBodies(bodies);
  const out: string[] = [];

  out.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  out.push('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">');
  out.push('<metadata name="Application">Holecraft</metadata><resources>');

  out.push(`<basematerials id="${MATERIALS_ID}">`);
  for (const { name, color } of bodies) {
    out.push(`<base name="${escapeXml(oneLine(name, 'body'))}" displaycolor="#${color.slice(1).toUpperCase()}FF"/>`);
  }
  out.push('</basematerials>');

  bodies.forEach(({ name, mesh }, index) => {
    out.push(`<object id="${MATERIALS_ID + 1 + index}" type="model" name="${escapeXml(oneLine(name, 'body'))}" pid="${MATERIALS_ID}" pindex="${index}"><mesh><vertices>`);
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) out.push(`<vertex x="${formatNumber(p[i]!)}" y="${formatNumber(p[i + 1]!)}" z="${formatNumber(p[i + 2]!)}"/>`);
    out.push('</vertices><triangles>');
    for (let t = 0; t < mesh.indices.length; t += 3) {
      out.push(`<triangle v1="${mesh.indices[t]}" v2="${mesh.indices[t + 1]}" v3="${mesh.indices[t + 2]}"/>`);
    }
    out.push('</triangles></mesh></object>');
  });

  out.push('</resources><build>');
  bodies.forEach((_, index) => out.push(`<item objectid="${MATERIALS_ID + 1 + index}"/>`));
  out.push('</build></model>');

  const encode = (text: string) => new TextEncoder().encode(text);
  return writeStoredZip([
    { name: '[Content_Types].xml', data: encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: encode(RELATIONSHIPS) },
    { name: '3D/3dmodel.model', data: encode(out.join('')) },
  ]);
}
