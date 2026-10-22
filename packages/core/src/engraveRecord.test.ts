import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type GroupNode, type ShapeNode } from './design.ts';
import type { EngraveSettings } from './engrave.ts';
import { engraveParams, engraveRecordOf, engravingsIn, frameInWorld } from './engraveRecord.ts';
import { groupNodes } from './groups.ts';
import { invertAffine, multiplyMat4, transformPoint } from './mat4.ts';
import { addShape } from './ops.ts';
import { frameOfPlane, type SketchFrame } from './sketchFrame.ts';
import { parseDesign } from './validate.ts';

const settings: EngraveSettings = { text: 'Hello', font: 4, em: 7.5, angle: 30, at: [3, -4], depth: 1.2, mode: 'engrave' };
const frame: SketchFrame = frameOfPlane({ origin: [1, 2, 3], normal: [0, 0, 1] });

describe('engraveParams and engraveRecordOf', () => {
	it('keep every choice and the plane the words were placed on, in numbers and text the design can hold', () => {
		const params = engraveParams({ settings, frame });
		expect(Object.values(params).every((v) => typeof v === 'number' || typeof v === 'string')).toBe(true);
		const node = { kind: 'shape', params } as unknown as ShapeNode;
		expect(engraveRecordOf(node)).toEqual({ settings, frame });
	});

	it('remember raised lettering as well', () => {
		const node = { kind: 'shape', params: engraveParams({ settings: { ...settings, mode: 'raised' }, frame }) } as unknown as ShapeNode;
		expect(engraveRecordOf(node)?.settings.mode).toBe('raised');
	});

	it('survive being saved and read back through the validator, which drops what it does not know', () => {
		let design = createEmptyDesign('0123456789abcdef0123456789abcdef', 'D');
		design = addShape(design, 'box', [0, 0]).design;
		const id = design.roots[0]!;
		const node = design.nodes[id] as ShapeNode;
		design = {
			...design,
			nodes: { ...design.nodes, [id]: { ...node, params: { ...node.params, ...engraveParams({ settings, frame }) } } },
		};
		const back = parseDesign(JSON.parse(JSON.stringify(design)));
		expect(engraveRecordOf(back.nodes[id]!)).toEqual({ settings, frame });
	});

	it('are null for anything that is not an engraving, or whose numbers are damaged', () => {
		const plain = { kind: 'shape', params: { width: 1, depth: 1, height: 1 } } as unknown as ShapeNode;
		expect(engraveRecordOf(plain)).toBeNull();
		const bad = { kind: 'shape', params: { ...engraveParams({ settings, frame }), engEm: Number.NaN } } as unknown as ShapeNode;
		expect(engraveRecordOf(bad)).toBeNull();
		const noMode = { kind: 'shape', params: { ...engraveParams({ settings, frame }), engMode: 7 } } as unknown as ShapeNode;
		expect(engraveRecordOf(noMode)).toBeNull();
		expect(engraveRecordOf({ kind: 'group' } as unknown as GroupNode)).toBeNull();
	});

	it('cut the words to what a text parameter can hold', () => {
		const long = engraveParams({ settings: { ...settings, text: 'x'.repeat(300) }, frame });
		expect((long.engText as string).length).toBeLessThanOrEqual(100);
	});
});

describe('engravingsIn', () => {
	it('finds the engravings directly inside a group, with their records', () => {
		let design: Design = createEmptyDesign('0123456789abcdef0123456789abcdef', 'D');
		design = addShape(design, 'box', [0, 0]).design;
		design = addShape(design, 'box', [50, 0]).design;
		const [a, b] = design.roots as [string, string];
		const node = design.nodes[b] as ShapeNode;
		design = { ...design, nodes: { ...design.nodes, [b]: { ...node, params: { ...node.params, ...engraveParams({ settings, frame }) } } } };
		const grouped = groupNodes(design, [a, b]);
		const found = engravingsIn(grouped.design, grouped.id!);
		expect(found).toEqual([{ id: b, record: { settings, frame } }]);
		expect(engravingsIn(grouped.design, a)).toEqual([]);
		expect(engravingsIn(grouped.design, 'nope')).toEqual([]);
	});
});

describe('frameInWorld', () => {
	const group = (transform: number[], scale?: [number, number, number]) =>
		({ kind: 'group', transform, ...(scale ? { scale } : {}) }) as unknown as GroupNode;
	const turned = (deg: number, at: [number, number, number]) => {
		const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
		return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, ...at, 1];
	};

	it('is the same frame for a group that has not moved', () => {
		const moved = frameInWorld(group([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), frame);
		expect(moved.origin).toEqual(frame.origin);
		expect(moved.normal).toEqual(frame.normal);
	});

	it('follows a group that was moved and turned about the plane’s normal: the words turn with it', () => {
		const moved = frameInWorld(group(turned(90, [10, 20, 0])), frame);
		expect(moved.origin[0]).toBeCloseTo(10 - 2, 9);
		expect(moved.origin[1]).toBeCloseTo(20 + 1, 9);
		expect(moved.origin[2]).toBeCloseTo(3, 9);
		expect(moved.u[0]).toBeCloseTo(0, 9);
		expect(moved.u[1]).toBeCloseTo(1, 9);
		expect(moved.normal[2]).toBeCloseTo(1, 9);
	});

	it('stays a frame of unit axes at right angles when the group is stretched', () => {
		const f = frameInWorld(group(turned(20, [0, 0, 0]), [2, 3, 1]), frame);
		const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
		expect(dot(f.u, f.u)).toBeCloseTo(1, 9);
		expect(dot(f.v, f.v)).toBeCloseTo(1, 9);
		expect(dot(f.normal, f.normal)).toBeCloseTo(1, 9);
		expect(dot(f.u, f.v)).toBeCloseTo(0, 9);
		expect(dot(f.u, f.normal)).toBeCloseTo(0, 9);
	});
});

describe('invertAffine', () => {
	it('undoes a matrix with a turn, a stretch and a move', () => {
		const m = [2 * Math.cos(0.5), 2 * Math.sin(0.5), 0, 0, -3 * Math.sin(0.5), 3 * Math.cos(0.5), 0, 0, 0, 0, 0.5, 0, 7, -8, 9, 1];
		const inv = invertAffine(m)!;
		const product = multiplyMat4(inv, m);
		for (let i = 0; i < 16; i++) expect(product[i]).toBeCloseTo(i % 5 === 0 ? 1 : 0, 9);
		const p = transformPoint(inv, transformPoint(m, [1, 2, 3]));
		expect(p[0]).toBeCloseTo(1, 9);
		expect(p[1]).toBeCloseTo(2, 9);
		expect(p[2]).toBeCloseTo(3, 9);
	});

	it('is null for a matrix that flattens space', () => {
		expect(invertAffine([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toBeNull();
	});
});
