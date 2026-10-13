import { paletteSlotOf } from '@holecraft/core';
import type { ExportBody } from '../export.ts';
import type { GroupMesh } from '../types.ts';
import { ORCA_FILAMENT_DEFAULTS } from './orcaFilamentDefaults.ts';
import { formatNumber, oneLine, requireBodies } from './shared.ts';
import { writeStoredZip } from './zip.ts';

const escapeXml = (text: string) =>
	text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		// biome-ignore lint/suspicious/noControlCharactersInRegex: XML 1.0 cannot hold these characters, so they are removed
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/></Types>`;

const RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

/** The material id used for the shared list of body colours; objects take the ids after it. */
const MATERIALS_ID = 1;

export interface ThreeMfOptions {
	/**
	 * Filament colours (the design's palette, #rrggbb, slot 1 first). When given, the file is also written
	 * the way OrcaSlicer (and Bambu Studio, and Trident) read a multi-material project: each object is
	 * assigned the filament nearest its colour, and the filament list is stored with the file.
	 */
	filaments?: readonly string[];
}

const HEX_DIGITS = '0123456789ABCDEF';

/**
 * The `paint_color` text OrcaSlicer reads for a whole triangle painted in filament `slot` (from 1), as its TriangleSelector writes it for a
 * triangle that is not split. The state is the filament number: 1 and 2 are two bits, written after the two zero "not split" bits, so a
 * single digit; from 3 the two bits are 11 and a digit of (state - 3) follows, from 18 an F and a digit of (state - 18). The digits are
 * written last first.
 */
export function orcaPaintCode(slot: number): string {
	if (slot < 3) return HEX_DIGITS[slot << 2]!;
	if (slot < 18) return `${HEX_DIGITS[slot - 3]}C`;
	if (slot > 33) throw new Error(`OrcaSlicer has no filament ${slot}`);
	return `${HEX_DIGITS[slot - 18]}FC`;
}

/** The attribute for triangle `t` of a body, if it is painted: its colour's filament in the palette. */
function paintAttribute(mesh: GroupMesh, t: number, slots: readonly number[]): string {
	const colour = mesh.paint?.triangle[t];
	return colour ? ` paint_color="${orcaPaintCode(slots[colour - 1]!)}"` : '';
}

/** OrcaSlicer's object settings: per object its name and 1-based filament, and everything on the first plate. */
function modelSettings(bodies: readonly ExportBody[], filaments: readonly string[]): string {
	const out = ['<?xml version="1.0" encoding="UTF-8"?>\n<config>\n'];
	const ids = bodies.map((_, index) => MATERIALS_ID + 1 + index);
	bodies.forEach(({ name, color }, index) => {
		out.push(` <object id="${ids[index]}">\n  <metadata key="name" value="${escapeXml(oneLine(name, 'body'))}"/>\n`);
		out.push(`  <metadata key="extruder" value="${paletteSlotOf(filaments, color)}"/>\n </object>\n`);
	});
	out.push(
		' <plate>\n  <metadata key="plater_id" value="1"/>\n  <metadata key="plater_name" value=""/>\n  <metadata key="locked" value="false"/>\n',
	);
	for (const id of ids) {
		out.push(
			`  <model_instance>\n   <metadata key="object_id" value="${id}"/>\n   <metadata key="instance_id" value="0"/>\n   <metadata key="identify_id" value="${id}"/>\n  </model_instance>\n`,
		);
	}
	out.push(' </plate>\n</config>\n');
	return out.join('');
}

/**
 * OrcaSlicer's project settings, holding only the filaments: their colours, and every per-filament setting
 * (temperatures, fan speeds, flow...) at the preset's value, once per filament. OrcaSlicer counts filaments
 * by `filament_colour` and indexes all those lists with that count, and crashes on load if any is shorter,
 * so they must all match. Nothing about the printer or the print profile is written, so opening the file
 * does not replace the user's own.
 */
function projectSettings(filaments: readonly string[]): string {
	const settings: Record<string, string[]> = { filament_colour: filaments.map((c) => c.toUpperCase()) };
	for (const [key, value] of Object.entries(ORCA_FILAMENT_DEFAULTS)) settings[key] = filaments.map(() => value);
	return JSON.stringify(settings, null, 2);
}

/** A 3MF file: one object per body (named, coloured), in millimetres. With `filaments`, also ready for multi-material slicing. */
export function write3mf(bodies: readonly ExportBody[], options: ThreeMfOptions = {}): Uint8Array {
	requireBodies(bodies);
	const filaments = options.filaments;
	if (filaments && filaments.length === 0) throw new Error('The palette has no filament colours');
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
		// only an Orca export carries paint (the plain formats have no place for it), as the filament of each painted colour
		const slots = filaments ? (mesh.paint?.colors ?? []).map((c) => paletteSlotOf(filaments, c)) : [];
		out.push(
			`<object id="${MATERIALS_ID + 1 + index}" type="model" name="${escapeXml(oneLine(name, 'body'))}" pid="${MATERIALS_ID}" pindex="${index}"><mesh><vertices>`,
		);
		const p = mesh.positions;
		for (let i = 0; i < p.length; i += 3)
			out.push(`<vertex x="${formatNumber(p[i]!)}" y="${formatNumber(p[i + 1]!)}" z="${formatNumber(p[i + 2]!)}"/>`);
		out.push('</vertices><triangles>');
		for (let t = 0; t < mesh.indices.length; t += 3) {
			const paint = filaments ? paintAttribute(mesh, t / 3, slots) : '';
			out.push(`<triangle v1="${mesh.indices[t]}" v2="${mesh.indices[t + 1]}" v3="${mesh.indices[t + 2]}"${paint}/>`);
		}
		out.push('</triangles></mesh></object>');
	});

	out.push('</resources><build>');
	for (let index = 0; index < bodies.length; index++) out.push(`<item objectid="${MATERIALS_ID + 1 + index}"/>`);
	out.push('</build></model>');

	const encode = (text: string) => new TextEncoder().encode(text);
	const parts = [
		{ name: '[Content_Types].xml', data: encode(CONTENT_TYPES) },
		{ name: '_rels/.rels', data: encode(RELATIONSHIPS) },
		{ name: '3D/3dmodel.model', data: encode(out.join('')) },
	];
	if (filaments) {
		parts.push(
			{ name: 'Metadata/model_settings.config', data: encode(modelSettings(bodies, filaments)) },
			{ name: 'Metadata/project_settings.config', data: encode(projectSettings(filaments)) },
		);
	}
	return writeStoredZip(parts);
}
