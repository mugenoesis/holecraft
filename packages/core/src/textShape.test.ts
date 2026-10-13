import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import { setShapeSize } from './edit.ts';
import { addShape } from './ops.ts';
import { setShapeParam, shapeParam } from './parametricShapes.ts';
import { getShapeDef } from './shapes.ts';
import { textMetrics } from './text.ts';
import { setShapeText, textOf } from './textShape.ts';
import { parseDesign } from './validate.ts';
import { setLocked } from './visibility.ts';

const made = () => addShape(createEmptyDesign('d'), 'text', [0, 0], { id: 't' }).design;
const node = (d: ReturnType<typeof made>) => d.nodes.t as ShapeNode;
const size = (d: ReturnType<typeof made>) => [node(d).params.width, node(d).params.depth, node(d).params.height] as number[];

describe('the Text shape', () => {
	it('is a parametric shape named Text, found by search, saying Text to start, in the Sans font, with the letters 10 mm to the em and 3 mm thick', () => {
		const def = getShapeDef('text');
		expect(def.name).toBe('Text');
		expect(def.category).toBe('parametric');
		expect(def.keywords).toEqual(expect.arrayContaining(['letters', 'words', 'label']));
		expect(def.params!.map((p) => p.key)).toEqual(['font']);
		const d = made();
		expect(textOf(node(d))).toBe('Text');
		expect(shapeParam(node(d), 'font')).toBe(1);
		const m = textMetrics('Text', 1)!;
		const [w, depth, h] = size(d);
		expect(w).toBeCloseTo(m.width * 10, 6);
		expect(depth).toBeCloseTo(m.depth * 10, 6);
		expect(h).toBe(3);
		expect(def.defaultSize.map((v) => Math.round(v * 1e6))).toEqual(size(d).map((v) => Math.round(v * 1e6)));
	});

	it('keeps its words through saving and reading back, and is called a number 1 when there are several', () => {
		const d = setShapeText(made(), 't', 'Hello there')!;
		expect(textOf(parseDesign(JSON.parse(JSON.stringify(d))).nodes.t as ShapeNode)).toBe('Hello there');
		expect(node(addShape(d, 'text', [0, 0], { id: 'u' }).design).name).toBe('Text 1');
	});

	it('says Text when its words are missing (a damaged file) rather than making nothing', () => {
		const bad = { ...node(made()), params: { width: 20, depth: 8, height: 3 } } as ShapeNode;
		expect(textOf(bad)).toBe('Text');
	});
});

describe('setShapeText', () => {
	it('changes the words and the size to match, keeping the letters as big as they were (the em stays 10 mm) and the thickness', () => {
		const d = setShapeText(made(), 't', 'Hello')!;
		const m = textMetrics('Hello', 1)!;
		const [w, depth, h] = size(d);
		expect([w, depth, h]).toEqual([expect.closeTo(m.width * 10, 6), expect.closeTo(m.depth * 10, 6), 3]);
		expect(textOf(node(d))).toBe('Hello');
	});

	it('keeps the letters as big as the shape was stretched to: twice as deep means a 20 mm em', () => {
		let d = made();
		d = setShapeSize(d, 't', { depth: size(d)[1]! * 2 });
		d = setShapeText(d, 't', 'Hi')!;
		const m = textMetrics('Hi', 1)!;
		expect(size(d)[1]).toBeCloseTo(m.depth * 20, 6);
		expect(size(d)[0]).toBeCloseTo(m.width * 20, 6);
	});

	it('is one change, and nothing when the words are the same', () => {
		const d = made();
		expect(setShapeText(d, 't', 'Text')).toBe(d);
		expect(setShapeText(d, 't', 'Other')).not.toBe(d);
	});

	it('is cut off at 100 characters', () => {
		const d = setShapeText(made(), 't', 'i'.repeat(150))!;
		expect(textOf(node(d))).toBe('i'.repeat(100));
	});

	it('is refused (the same design back) for words with no ink, a locked shape, a shape that is not text, and a size that is too big', () => {
		const d = made();
		for (const words of ['', '   ', '中文']) expect(setShapeText(d, 't', words)).toBe(d);
		const locked = setLocked(d, ['t'], true);
		expect(setShapeText(locked, 't', 'Hi')).toBe(locked);
		const box = addShape(createEmptyDesign('b'), 'box', [0, 0], { id: 'b' }).design;
		expect(setShapeText(box, 'b', 'Hi')).toBe(box);
		expect(setShapeText(d, 'nope', 'Hi')).toBe(d);
		const huge = setShapeSize(d, 't', { depth: size(d)[1]! * 90 }); // an em of about 900 mm
		expect(setShapeText(huge, 't', 'Hello there everyone')).toBe(huge);
	});
});

describe('changing the font', () => {
	it('resizes the shape to the new font’s letters, at the same em, and keeps the words', () => {
		const d = setShapeParam(setShapeText(made(), 't', 'Hello')!, 't', 'font', 3);
		expect(shapeParam(node(d), 'font')).toBe(3);
		const m = textMetrics('Hello', 3)!;
		expect(size(d)[0]).toBeCloseTo(m.width * 10, 6);
		expect(size(d)[1]).toBeCloseTo(m.depth * 10, 6);
		expect(textOf(node(d))).toBe('Hello');
	});

	it('takes only the fonts there are', () => {
		const d = made();
		expect(setShapeParam(d, 't', 'font', 9)).toBe(d);
	});
});
