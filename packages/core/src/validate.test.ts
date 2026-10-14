import { describe, expect, it } from 'vitest';
import { createEmptyDesign, DESIGN_FORMAT_VERSION, type Design } from './design.ts';
import { groupNodes } from './groups.ts';
import { addShape } from './ops.ts';
import { DesignValidationError, parseDesign, renameDesign } from './validate.ts';

function sample(): Design {
	let d = createEmptyDesign('abc123', 'Bracket', new Date('2026-01-01T00:00:00Z'));
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'cylinder', [10, 10], { id: 'b' }).design;
	d = addShape(d, 'sphere', [30, 0], { id: 'c' }).design;
	return groupNodes(d, ['a', 'b'], { id: 'g' }).design;
}

// biome-ignore lint/suspicious/noExplicitAny: the tests reach into arbitrary, untrusted JSON shapes on purpose
type Wire = Record<string, any>;

/** Deep copy as plain JSON, as a design arrives off the wire. */
const wire = (d: Design = sample()) => JSON.parse(JSON.stringify(d)) as Wire;

function rejects(mutate: (d: Wire) => void, message?: RegExp) {
	const d = wire();
	mutate(d);
	expect(() => parseDesign(d)).toThrow(DesignValidationError);
	if (message) expect(() => parseDesign(d)).toThrow(message);
}

describe('parseDesign: good designs', () => {
	it('accepts what the app produces and returns an equal design', () => {
		const design = sample(); // built once: every edit stamps the current time into updatedAt
		expect(parseDesign(wire(design))).toEqual(design);
	});

	it('accepts an empty design', () => {
		expect(parseDesign(wire(createEmptyDesign('x')))).toMatchObject({ id: 'x', roots: [], nodes: {} });
	});

	it('accepts a design that has been through JSON text', () => {
		const design = sample();
		expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
	});

	it('returns a copy, never the object it was given', () => {
		const input = wire();
		const out = parseDesign(input);
		out.nodes.a!.transform[12] = 99;
		expect(input.nodes.a.transform[12]).toBe(0);
	});

	it('drops properties it does not know about', () => {
		const d = wire();
		d.evil = '<script>';
		d.nodes.a.extra = 1;
		const out = parseDesign(d) as unknown as Wire;
		expect(out.evil).toBeUndefined();
		expect(out.nodes.a.extra).toBeUndefined();
	});

	it('drops nodes that nothing refers to', () => {
		const d = wire();
		d.nodes.orphan = { ...d.nodes.c, id: 'orphan' };
		expect(Object.keys(parseDesign(d).nodes).sort()).toEqual(['a', 'b', 'c', 'g']);
	});

	it('keeps nested groups', () => {
		const d = groupNodes(sample(), ['g', 'c'], { id: 'outer' }).design;
		expect(parseDesign(wire(d))).toEqual(d);
	});

	it('keeps holes, locks and hidden flags', () => {
		const d = wire();
		d.nodes.b.mode = 'hole';
		d.nodes.c.hidden = true;
		d.nodes.c.locked = true;
		const out = parseDesign(d);
		expect(out.nodes.b!.mode).toBe('hole');
		expect(out.nodes.c).toMatchObject({ hidden: true, locked: true });
	});
});

describe('parseDesign: the envelope', () => {
	it('rejects things that are not objects', () => {
		for (const bad of [null, undefined, 42, 'design', [], true]) expect(() => parseDesign(bad)).toThrow(DesignValidationError);
	});

	it('rejects a missing or unsupported format version', () => {
		rejects((d) => delete d.formatVersion, /formatVersion/);
		rejects((d) => (d.formatVersion = 0), /formatVersion/);
		rejects((d) => (d.formatVersion = '1'), /formatVersion/);
		rejects((d) => (d.formatVersion = DESIGN_FORMAT_VERSION + 1), /newer version/);
	});

	it('requires a sensible id and name', () => {
		rejects((d) => (d.id = ''), /id/);
		rejects((d) => (d.id = 'x'.repeat(100)), /id/);
		rejects((d) => (d.name = 7), /name/);
		rejects((d) => (d.name = 'n'.repeat(500)), /name/);
	});

	it('only allows mm or inch units', () => {
		rejects((d) => (d.units = 'furlongs'), /units/);
	});

	it('checks the grid', () => {
		rejects((d) => (d.grid = null), /grid/);
		rejects((d) => (d.grid.size = [200]), /grid/);
		rejects((d) => (d.grid.size = [0, 200]), /grid/);
		rejects((d) => (d.grid.size = [200, 1e9]), /grid/);
		rejects((d) => (d.grid.snap = -1), /grid/);
		rejects((d) => (d.grid.snap = Number.NaN), /grid/);
	});

	it('repairs missing or unparseable dates rather than refusing the design', () => {
		const d = wire();
		delete d.createdAt;
		d.updatedAt = 'yesterday-ish';
		const out = parseDesign(d);
		expect(Number.isNaN(Date.parse(out.createdAt))).toBe(false);
		expect(Number.isNaN(Date.parse(out.updatedAt))).toBe(false);
	});
});

describe('parseDesign: nodes', () => {
	it('requires nodes and roots to have the right shape', () => {
		rejects((d) => (d.nodes = []), /nodes/);
		rejects((d) => (d.nodes = null), /nodes/);
		rejects((d) => (d.roots = 'a'), /roots/);
		rejects((d) => (d.roots = [1]), /roots/);
	});

	it('requires every node id to match its key', () => {
		rejects((d) => (d.nodes.a.id = 'other'), /id/);
	});

	it('checks the common fields', () => {
		rejects((d) => (d.nodes.a.name = 5), /name/);
		rejects((d) => (d.nodes.a.mode = 'ghost'), /mode/);
		rejects((d) => (d.nodes.a.color = 'red'), /color/);
		rejects((d) => (d.nodes.a.color = '#12345'), /color/);
		rejects((d) => (d.nodes.a.hidden = 'no'), /hidden/);
		rejects((d) => (d.nodes.a.locked = 0), /locked/);
	});

	it('requires a transform of sixteen finite numbers', () => {
		rejects((d) => (d.nodes.a.transform = [1, 0, 0]), /transform/);
		rejects((d) => (d.nodes.a.transform[5] = null), /transform/);
		rejects((d) => (d.nodes.a.transform[5] = 'x'), /transform/);
		rejects((d) => (d.nodes.a.transform = 'identity'), /transform/);
	});

	it('refuses transforms that are absurdly far away', () => {
		rejects((d) => (d.nodes.a.transform[12] = 1e12), /transform/);
	});

	it('knows only shapes, groups and meshes', () => {
		rejects((d) => (d.nodes.a.kind = 'sprite'), /kind/);
		rejects((d) => delete d.nodes.a.kind, /kind/);
	});

	it('checks shapes: a known type and sensible sizes', () => {
		rejects((d) => (d.nodes.a.shapeType = 'teapot'), /shapeType/);
		rejects((d) => (d.nodes.a.params.width = 0), /width/);
		rejects((d) => (d.nodes.a.params.depth = -5), /depth/);
		rejects((d) => (d.nodes.a.params.height = 1e6), /height/);
		rejects((d) => (d.nodes.a.params.height = Number.NaN), /height/);
		rejects((d) => delete d.nodes.a.params, /params/);
		rejects((d) => (d.nodes.c.params.width = 'big'), /width/);
	});

	it('only keeps simple parameter values', () => {
		const d = wire();
		d.nodes.a.params.sides = 8;
		d.nodes.a.params.label = 'x';
		d.nodes.a.params.nested = { bad: true };
		const out = parseDesign(d);
		const params = (out.nodes.a as { params: Record<string, unknown> }).params;
		expect(params.sides).toBe(8);
		expect(params.nested).toBeUndefined();
	});

	it('checks groups: children, operation and colour mode', () => {
		rejects((d) => (d.nodes.g.children = 'a'), /children/);
		rejects((d) => (d.nodes.g.children = ['a', 'ghost']), /ghost/);
		rejects((d) => (d.nodes.g.op = 'xor'), /op/);
		rejects((d) => (d.nodes.g.multicolor = 'yes'), /multicolor/);
	});

	it('checks mesh nodes have a reference', () => {
		const d = wire();
		d.nodes.m = { ...d.nodes.c, id: 'm', kind: 'mesh', meshRef: 'abc' };
		delete d.nodes.m.shapeType;
		delete d.nodes.m.params;
		d.roots.push('m');
		expect(parseDesign(d).nodes.m).toMatchObject({ kind: 'mesh', meshRef: 'abc' });
		d.nodes.m.meshRef = 5;
		expect(() => parseDesign(d)).toThrow(/meshRef/);
	});
});

describe('parseDesign: edge treatments (chamfers and rounds on chosen edges)', () => {
	/** The top front edge of a 20 mm box at the origin: from the top (+z) and the front (-y). */
	const treatment = () => ({
		id: 'e1',
		kind: 'chamfer',
		size: 2,
		points: [
			[-10, -10, 20],
			[10, -10, 20],
		],
		normals: [
			[
				[0, 0, 1],
				[0, -1, 0],
			],
		],
	});
	const withEdges = (edges: unknown) => {
		const d = wire();
		d.nodes.g.edges = edges;
		return d;
	};

	it('keeps a valid list on a group, and on a shape', () => {
		expect(parseDesign(withEdges([treatment(), { ...treatment(), id: 'e2', kind: 'round' }])).nodes.g!.edges).toHaveLength(2);
		const d = wire();
		d.nodes.c.edges = [treatment()];
		expect(parseDesign(d).nodes.c!.edges).toEqual([treatment()]);
	});

	it('leaves the field out when there are none', () => {
		expect('edges' in parseDesign(withEdges([])).nodes.g!).toBe(false);
		expect('edges' in parseDesign(wire()).nodes.g!).toBe(false);
	});

	it('refuses broken treatments', () => {
		const bad: [string, (t: Wire) => void][] = [
			['kind', (t) => (t.kind = 'sand')],
			['size', (t) => (t.size = 0)],
			['size', (t) => (t.size = 5000)],
			['size', (t) => (t.size = 'big')],
			['id', (t) => (t.id = 7)],
			['id', (t) => (t.id = 'x'.repeat(200))],
			['points', (t) => (t.points = [[0, 0, 0]])],
			[
				'points',
				(t) =>
					(t.points = [
						[0, 0],
						[1, 1, 1],
					]),
			],
			['points', (t) => (t.points[1][2] = Number.NaN)],
			['points', (t) => (t.points[1][2] = 1e9)],
			['normals', (t) => (t.normals = [])],
			['normals', (t) => (t.normals[0][0] = [0, 0, 5])],
			['normals', (t) => (t.normals[0] = [[0, 0, 1]])],
		];
		for (const [field, mutate] of bad) {
			const t = treatment() as Wire;
			mutate(t);
			expect(() => parseDesign(withEdges([t])), field).toThrow(DesignValidationError);
		}
		expect(() => parseDesign(withEdges('all'))).toThrow(/edges/);
		expect(() => parseDesign(withEdges(Array.from({ length: 1001 }, (_, i) => ({ ...treatment(), id: `e${i}` }))))).toThrow(/edges/);
	});

	it('refuses two treatments with the same id on one node', () => {
		expect(() => parseDesign(withEdges([treatment(), treatment()]))).toThrow(/id/);
	});

	it('drops unknown properties inside a treatment', () => {
		const loaded = parseDesign(withEdges([{ ...treatment(), colour: 'red' }]));
		expect(loaded.nodes.g!.edges![0]).toEqual(treatment());
	});

	it('loads designs saved before edges existed (format 2)', () => {
		const old = wire();
		old.formatVersion = 2;
		const loaded = parseDesign(old);
		expect(loaded.formatVersion).toBe(DESIGN_FORMAT_VERSION);
		expect(DESIGN_FORMAT_VERSION).toBeGreaterThanOrEqual(5);
	});
});

describe('parseDesign: structure', () => {
	it('rejects roots that do not exist', () => {
		rejects((d) => d.roots.push('ghost'), /ghost/);
	});

	it('rejects the same root listed twice', () => {
		rejects((d) => d.roots.push('c'), /twice|duplicate/i);
	});

	it('rejects a node that is both a root and inside a group', () => {
		rejects((d) => d.roots.push('a'), /more than once|twice|parent/i);
	});

	it('rejects a node that sits in two groups', () => {
		rejects((d) => {
			d.nodes.g2 = { ...d.nodes.g, id: 'g2', children: ['a'] };
			d.roots.push('g2');
		}, /more than once|twice|parent/i);
	});

	it('rejects a group that contains itself, directly or through others', () => {
		rejects((d) => d.nodes.g.children.push('g'), /cycle|itself|more than once|parent/i);
		rejects((d) => {
			d.nodes.g2 = { ...d.nodes.g, id: 'g2', children: ['g'] };
			d.nodes.g.children = ['g2', 'a', 'b'];
			d.roots = ['c', 'g'];
		}, /cycle|itself|more than once|parent/i);
	});

	it('rejects absurdly large designs', () => {
		const d = wire(createEmptyDesign('big'));
		for (let i = 0; i < 6000; i++) {
			d.nodes[`n${i}`] = { ...wire().nodes.c, id: `n${i}` };
			d.roots.push(`n${i}`);
		}
		expect(() => parseDesign(d)).toThrow(/too many/i);
	});

	it('rejects groups nested absurdly deep, which could overflow the stack', () => {
		const d = wire(createEmptyDesign('deep'));
		const depth = 200;
		d.nodes.leaf = { ...wire().nodes.c, id: 'leaf' };
		let inner = 'leaf';
		for (let i = 0; i < depth; i++) {
			d.nodes[`g${i}`] = { ...wire().nodes.g, id: `g${i}`, children: [inner] };
			inner = `g${i}`;
		}
		d.roots = [inner];
		expect(() => parseDesign(d)).toThrow(/deep|nest/i);
	});
});

describe('DesignValidationError', () => {
	it('says where the problem is', () => {
		const d = wire();
		d.nodes.a.params.width = -1;
		try {
			parseDesign(d);
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(DesignValidationError);
			expect((e as DesignValidationError).path).toContain('nodes.a');
			expect((e as Error).message).toContain('width');
		}
	});
});

describe('renameDesign', () => {
	it('renames, trimming whitespace', () => {
		expect(renameDesign(sample(), '  New name ').name).toBe('New name');
	});

	it('keeps names within the limit and ignores blank ones', () => {
		const d = sample();
		expect(renameDesign(d, '   ')).toBe(d);
		expect(renameDesign(d, 'x'.repeat(500)).name).toHaveLength(120);
		expect(renameDesign(d, 'Bracket')).toBe(d);
	});
});
