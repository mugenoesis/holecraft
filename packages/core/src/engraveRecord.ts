import type { Vec3 } from './camera.ts';
import type { Design, DesignNode, GroupNode, NodeId, ShapeNode } from './design.ts';
import type { EngraveSettings } from './engrave.ts';
import { groupFrame } from './groupFrame.ts';
import type { SketchFrame } from './sketchFrame.ts';

/*
 * What an engraving remembers so it can be edited: the choices made in the Engrave tool and the plane the words were placed on, kept in the
 * numbers and text of its mesh shape's `params` (the design format already keeps them, so there is no new format). The plane is kept in the frame
 * of the group the engraving sits in, so it follows the group when that is moved, turned or stretched.
 */

/** What an engraving remembers: its choices, and the plane the words were placed on (in the frame of the group it is in). */
export interface EngraveRecord {
	settings: EngraveSettings;
	frame: SketchFrame;
}

/** The most words a text parameter can hold. */
const MAX_TEXT = 100;

const KEYS = ['engText', 'engFont', 'engEm', 'engAngle', 'engAtX', 'engAtY', 'engDepth', 'engMode'] as const;
const FRAME_KEYS = ['engOx', 'engOy', 'engOz', 'engUx', 'engUy', 'engUz', 'engNx', 'engNy', 'engNz'] as const;

/** The params that carry a record (merge them into the mesh shape's own). */
export function engraveParams({ settings: s, frame: f }: EngraveRecord): Record<string, number | string> {
	return {
		engText: s.text.slice(0, MAX_TEXT),
		engFont: s.font,
		engEm: s.em,
		engAngle: s.angle,
		engAtX: s.at[0],
		engAtY: s.at[1],
		engDepth: s.depth,
		engMode: s.mode === 'engrave' ? 1 : 2,
		engOx: f.origin[0],
		engOy: f.origin[1],
		engOz: f.origin[2],
		engUx: f.u[0],
		engUy: f.u[1],
		engUz: f.u[2],
		engNx: f.normal[0],
		engNy: f.normal[1],
		engNz: f.normal[2],
	};
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The record a node carries, or null if it carries none (or damaged numbers). */
export function engraveRecordOf(node: DesignNode | undefined): EngraveRecord | null {
	if (node?.kind !== 'shape') return null;
	const p = node.params;
	if (typeof p.engText !== 'string' || ![...KEYS.slice(1), ...FRAME_KEYS].every((k) => typeof p[k] === 'number' && Number.isFinite(p[k])))
		return null;
	const n = (k: string) => p[k] as number;
	if (n('engMode') !== 1 && n('engMode') !== 2) return null;
	const u: Vec3 = [n('engUx'), n('engUy'), n('engUz')];
	const normal: Vec3 = [n('engNx'), n('engNy'), n('engNz')];
	return {
		settings: {
			text: p.engText,
			font: n('engFont'),
			em: n('engEm'),
			angle: n('engAngle'),
			at: [n('engAtX'), n('engAtY')],
			depth: n('engDepth'),
			mode: n('engMode') === 1 ? 'engrave' : 'raised',
		},
		frame: { origin: [n('engOx'), n('engOy'), n('engOz')], u, v: cross(normal, u), normal },
	};
}

/** The engravings sitting directly in a group, with what each remembers (nothing for a design without that group or a shape). */
export function engravingsIn(design: Design, groupId: NodeId): { id: NodeId; record: EngraveRecord }[] {
	const group = design.nodes[groupId];
	if (group?.kind !== 'group') return [];
	const found: { id: NodeId; record: EngraveRecord }[] = [];
	for (const id of group.children) {
		const record = engraveRecordOf(design.nodes[id] as ShapeNode | undefined);
		if (record) found.push({ id, record });
	}
	return found;
}

const norm = (v: Vec3): Vec3 => {
	const l = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * A frame kept in a group, as it is in the world now. The axes are carried by the group's turn and stretch, then made unit length and at right
 * angles again (a stretch that is not even would otherwise shear the frame: the words keep their size and shape and follow the surface).
 */
export function frameInWorld(group: GroupNode, local: SketchFrame): SketchFrame {
	const m = groupFrame(group);
	const along = (v: Vec3): Vec3 => [
		m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2],
		m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2],
		m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2],
	];
	const origin: Vec3 = [
		m[0]! * local.origin[0] + m[4]! * local.origin[1] + m[8]! * local.origin[2] + m[12]!,
		m[1]! * local.origin[0] + m[5]! * local.origin[1] + m[9]! * local.origin[2] + m[13]!,
		m[2]! * local.origin[0] + m[6]! * local.origin[1] + m[10]! * local.origin[2] + m[14]!,
	];
	const normal = norm(along(local.normal));
	const tangent = along(local.u);
	const dot = tangent[0] * normal[0] + tangent[1] * normal[1] + tangent[2] * normal[2];
	const u = norm([tangent[0] - dot * normal[0], tangent[1] - dot * normal[1], tangent[2] - dot * normal[2]]);
	return { origin, u, v: cross(normal, u), normal };
}
