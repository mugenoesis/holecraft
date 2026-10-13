import { describe, expect, it } from 'vitest';
import { createEmptyDesign, DESIGN_FORMAT_VERSION, type Design, type PaintFill } from './design.ts';
import { setNodeMode, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { setGroupSize } from './groupTransform.ts';
import { addShape } from './ops.ts';
import { addPaint, canPaint, clearPaint, stretchPaint } from './paintEdits.ts';
import { setPaletteColor } from './palette.ts';
import { parseDesign } from './validate.ts';
import { setHidden, setLocked } from './visibility.ts';

const RED = '#ff0000';
const top = (id = 'p1', color = RED): Extract<PaintFill, { kind: 'region' }> => ({
	id,
	kind: 'region',
	color,
	point: [0, 0, 20],
	normal: [0, 0, 1],
});
const whole = (color = RED, id = 'w'): PaintFill => ({ id, kind: 'body', color });
const start = () => addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
const paintOf = (d: Design, id = 'a') => d.nodes[id]!.paint;

describe('canPaint', () => {
	it('is true for an unlocked, visible, solid, top-level shape or group', () => {
		const d = start();
		expect(canPaint(d, 'a')).toBe(true);
		const two = groupNodes(addShape(d, 'cylinder', [30, 0], { id: 'b' }).design, ['a', 'b'], { id: 'g' }).design;
		expect(canPaint(two, 'g')).toBe(true);
	});

	it('is false for a locked, hidden or hole node, a node inside a group, and one that is not there', () => {
		const d = start();
		expect(canPaint(setLocked(d, ['a'], true), 'a')).toBe(false);
		expect(canPaint(setHidden(d, ['a'], true), 'a')).toBe(false);
		expect(canPaint(setNodeMode(d, ['a'], 'hole'), 'a')).toBe(false);
		const two = groupNodes(addShape(d, 'cylinder', [30, 0], { id: 'b' }).design, ['a', 'b'], { id: 'g' }).design;
		expect(canPaint(two, 'a')).toBe(false);
		expect(canPaint(d, 'nope')).toBe(false);
	});
});

describe('addPaint', () => {
	it('adds a fill after the ones there', () => {
		const d = addPaint(addPaint(start(), 'a', top('p1')), 'a', top('p2', '#0000ff'));
		expect(paintOf(d)!.map((f) => f.id)).toEqual(['p1', 'p2']);
	});

	it('lets a body fill replace everything before it, since it covers it all', () => {
		const d = addPaint(addPaint(start(), 'a', top('p1')), 'a', whole('#00ff00'));
		expect(paintOf(d)).toEqual([whole('#00ff00')]);
	});

	it('returns the same design when the fill is already the last one, or the node cannot be painted', () => {
		const d = addPaint(start(), 'a', top());
		expect(addPaint(d, 'a', top())).toBe(d);
		const locked = setLocked(d, ['a'], true);
		expect(addPaint(locked, 'a', top('p9', '#0000ff'))).toBe(locked);
		expect(addPaint(d, 'nope', top())).toBe(d);
	});

	it('refuses a bad colour, a normal that is not a direction, or a point that is not a number', () => {
		const d = start();
		expect(addPaint(d, 'a', { ...top(), color: 'red' })).toBe(d);
		expect(addPaint(d, 'a', { ...top(), normal: [0, 0, 0] } as PaintFill)).toBe(d);
		expect(addPaint(d, 'a', { ...top(), point: [Number.NaN, 0, 0] } as PaintFill)).toBe(d);
	});

	it('takes an erase (no colour), a bucket fill and a smart fill angle, and refuses an angle or a spread that makes no sense', () => {
		const erase: PaintFill = { id: 'e', kind: 'region', color: null, point: [0, 0, 20], normal: [0, 0, 1] };
		const bucket: PaintFill = { ...top('k'), spread: 'bucket' };
		const angled: PaintFill = { ...top('s'), angle: 45 };
		const d = addPaint(addPaint(addPaint(start(), 'a', erase), 'a', bucket), 'a', angled);
		expect(paintOf(d)).toEqual([erase, bucket, angled]);
		const plain = start();
		for (const bad of [{ angle: -1 }, { angle: 91 }, { angle: Number.NaN }, { spread: 'blob' }])
			expect(addPaint(plain, 'a', { ...top(), ...bad } as PaintFill)).toBe(plain);
		expect(parseDesign(JSON.parse(JSON.stringify(d))).nodes.a!.paint).toEqual(paintOf(d));
	});

	it('refuses an erase as a whole-body fill (a body fill needs a colour)', () => {
		const d = start();
		expect(addPaint(d, 'a', { id: 'x', kind: 'body', color: null } as unknown as PaintFill)).toBe(d);
	});

	it('lower-cases the colour, as nodes do', () => {
		expect(paintOf(addPaint(start(), 'a', top('p1', '#FF00AA')))![0]!.color).toBe('#ff00aa');
	});

	it('stops at 1000 fills rather than growing without end', () => {
		let d = start();
		for (let i = 0; i < 1000; i++) d = addPaint(d, 'a', top(`p${i}`, i % 2 ? '#0000ff' : RED));
		expect(paintOf(d)).toHaveLength(1000);
		expect(addPaint(d, 'a', top('extra', '#00ff00'))).toBe(d);
	});
});

describe('clearPaint', () => {
	it('removes the paint, and leaves out the field', () => {
		const d = clearPaint(addPaint(start(), 'a', top()), 'a');
		expect('paint' in d.nodes.a!).toBe(false);
	});

	it('is the same design when there is none, or the node is locked', () => {
		const d = start();
		expect(clearPaint(d, 'a')).toBe(d);
		const locked = setLocked(addPaint(d, 'a', top()), ['a'], true);
		expect(clearPaint(locked, 'a')).toBe(locked);
	});
});

describe('paint and the palette', () => {
	it('changes colour with its slot, like the shapes painted from it', () => {
		let d = addPaint(addPaint(start(), 'a', top('p1', '#2a9d8f')), 'a', top('p2', '#e76f51'));
		d = setPaletteColor(d, 1, '#112233');
		expect(paintOf(d)!.map((f) => f.color)).toEqual(['#112233', '#e76f51']);
	});

	it('leaves unpainted nodes and other colours alone, and the same design back when the slot changes nothing', () => {
		const d = start();
		expect(setPaletteColor(d, 1, '#112233').nodes.a).toBe(d.nodes.a);
	});
});

describe('saving paint', () => {
	it('keeps it through saving and reading back, and the format is 4 (older files load unchanged)', () => {
		expect(DESIGN_FORMAT_VERSION).toBe(4);
		const d = addPaint(addPaint(start(), 'a', top()), 'a', top('p2', '#0000ff'));
		expect(parseDesign(JSON.parse(JSON.stringify(d))).nodes.a!.paint).toEqual(paintOf(d));
		const old = JSON.parse(JSON.stringify(start()));
		old.formatVersion = 3;
		expect(parseDesign(old).nodes.a!.paint).toBeUndefined();
	});

	it('refuses paint that is not a list of well-formed fills', () => {
		const bad = (paint: unknown) => {
			const raw = JSON.parse(JSON.stringify(start()));
			raw.nodes.a.paint = paint;
			return () => parseDesign(raw);
		};
		expect(bad('red')).toThrow(/paint/);
		expect(bad([{ id: 'x', kind: 'region', color: 'red', point: [0, 0, 0], normal: [0, 0, 1] }])).toThrow(/colour/);
		expect(bad([{ id: 'x', kind: 'region', color: RED, point: [0, 0], normal: [0, 0, 1] }])).toThrow(/point/);
		expect(bad([{ id: 'x', kind: 'region', color: RED, point: [0, 0, 0], normal: [0, 0, 2] }])).toThrow(/normal/);
		expect(bad([{ id: 'x', kind: 'blob', color: RED }])).toThrow(/kind/);
		expect(bad([{ id: 'x', kind: 'body', color: null }])).toThrow(/colour/);
		expect(bad([{ id: 'x', kind: 'region', color: RED, point: [0, 0, 0], normal: [0, 0, 1], angle: 120 }])).toThrow(/angle/);
		expect(bad([{ id: 'x', kind: 'region', color: RED, point: [0, 0, 0], normal: [0, 0, 1], spread: 'blob' }])).toThrow(/spread/);
		expect(bad([whole(RED, 'x'), whole('#0000ff', 'x')])).toThrow(/own id/);
		expect(bad(Array.from({ length: 1001 }, (_, i) => whole(RED, `p${i}`)))).toThrow(/up to 1000/);
		expect(bad([{ id: 'x', kind: 'region', color: RED, point: [1e9, 0, 0], normal: [0, 0, 1] }])).toThrow(/point/);
	});

	it('drops fields it does not know and leaves out an empty list', () => {
		const raw = JSON.parse(JSON.stringify(start()));
		raw.nodes.a.paint = [{ ...whole(), extra: 1 }];
		expect(parseDesign(raw).nodes.a!.paint).toEqual([whole()]);
		raw.nodes.a.paint = [];
		expect('paint' in parseDesign(raw).nodes.a!).toBe(false);
	});
});

describe('stretchPaint', () => {
	it('moves the points with the stretched shape and turns the directions the way a stretched surface does', () => {
		const fills: PaintFill[] = [{ id: 'p', kind: 'region', color: RED, point: [4, 2, 6], normal: [0, 0, 1] }, whole(RED, 'w')];
		const out = stretchPaint(fills, [2, 3, 0.5], null)!;
		expect(out[0]).toMatchObject({ point: [8, 6, 3], normal: [0, 0, 1] });
		expect(out[1]).toBe(fills[1]);
		const slanted = stretchPaint(
			[{ id: 'p', kind: 'region', color: RED, point: [0, 0, 0], normal: [Math.SQRT1_2, 0, Math.SQRT1_2] }],
			[2, 1, 1],
			null,
		)!;
		const n = (slanted[0] as { normal: number[] }).normal;
		expect(Math.hypot(...(n as [number, number, number]))).toBeCloseTo(1, 9);
		expect(n[0]).toBeCloseTo(Math.sqrt(0.2), 9); // (1/2, 1) turned toward z, then made length 1
	});

	it('is the same list when nothing changes, and nothing when there is none', () => {
		const fills = [top()];
		expect(stretchPaint(fills, [1, 1, 1], null)).toBe(fills);
		expect(stretchPaint(undefined, [2, 2, 2], null)).toBeUndefined();
	});
});

describe('resizing keeps paint on its surface', () => {
	it('stretches a shape’s fills with it when its size is typed', () => {
		const d = setShapeSize(addPaint(start(), 'a', top()), 'a', { width: 40, height: 10 });
		expect(paintOf(d)![0]).toMatchObject({ point: [0, 0, 10] }); // the 20 mm top is now at 10 mm: the box was 20 high
	});

	it('stretches a group’s fills (in the frame of its contents) when the group is resized', () => {
		const d0 = groupNodes(addShape(start(), 'cylinder', [30, 0], { id: 'b' }).design, ['a', 'b'], { id: 'g' }).design;
		const before = addPaint(d0, 'g', { id: 'p', kind: 'region', color: RED, point: [10, 0, 20], normal: [0, 0, 1] });
		const after = setGroupSize(before, 'g', { height: 10 });
		expect((paintOf(after, 'g')![0] as { point: number[] }).point[2]).toBeCloseTo(10, 6);
	});
});
