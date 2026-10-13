import { describe, expect, it } from 'vitest';
import { dragModeFor } from './pressMode.ts';

const press = (over: Partial<{ id: string | null; additive: boolean; touch: boolean }> = {}) => ({
	id: null as string | null,
	additive: false,
	touch: false,
	...over,
});
const modeOf = (p: ReturnType<typeof press>, tool = false, multi = false, paints = false) => dragModeFor(p, tool, multi, paints);

describe('what a drag becomes', () => {
	it('drags a shape to move it, but a shift-press only toggles it', () => {
		expect(modeOf(press({ id: 'a' }))).toBe('move');
		expect(modeOf(press({ id: 'a', additive: true }))).toBe('none');
	});

	it('draws a selection box on empty space with a mouse, and orbits with a finger', () => {
		expect(modeOf(press())).toBe('marquee');
		expect(modeOf(press({ touch: true }))).toBe('orbit');
	});

	it('orbits on empty space while a surface tool (ruler, workplane, edges) is on', () => {
		expect(modeOf(press(), true)).toBe('orbit');
	});

	it('leaves a mouse drag to the tool while it paints on drag (the brush), but a finger still orbits since it has no other button to', () => {
		expect(modeOf(press(), true, false, true)).toBe('none');
		expect(modeOf(press({ touch: true }), true, false, true)).toBe('orbit');
		expect(modeOf(press(), false, false, true)).toBe('marquee'); // only while a surface tool is on
	});

	it('draws a selection box on empty space with a finger too, in multi-select mode', () => {
		expect(modeOf(press({ touch: true }), false, true)).toBe('marquee');
		expect(modeOf(press(), false, true)).toBe('marquee');
	});

	it('a surface tool wins over multi-select (the tool owns the left button)', () => {
		expect(modeOf(press({ touch: true }), true, true)).toBe('orbit');
	});
});
