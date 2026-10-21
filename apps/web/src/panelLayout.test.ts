import { describe, expect, it } from 'vitest';
import {
	clampPanelWidth,
	DEFAULT_PANEL_WIDTH,
	MAX_PANEL_WIDTH,
	MIN_PANEL_WIDTH,
	nudgedWidth,
	parseCollapsed,
	parsePanelWidth,
	toggleCollapsed,
	widthFromPointer,
} from './panelLayout.ts';

describe('the side panel width', () => {
	it('starts at the width the layout was designed for', () => {
		expect(DEFAULT_PANEL_WIDTH).toBe(260);
		expect(MIN_PANEL_WIDTH).toBeLessThan(DEFAULT_PANEL_WIDTH);
		expect(MAX_PANEL_WIDTH).toBeGreaterThan(DEFAULT_PANEL_WIDTH);
	});

	it('is kept between the least and the most, and rounded', () => {
		expect(clampPanelWidth(10)).toBe(MIN_PANEL_WIDTH);
		expect(clampPanelWidth(5000)).toBe(MAX_PANEL_WIDTH);
		expect(clampPanelWidth(300.4)).toBe(300);
		expect(clampPanelWidth(Number.NaN)).toBe(DEFAULT_PANEL_WIDTH);
	});

	it('never takes more than half of a narrow window, so the view keeps its room', () => {
		expect(clampPanelWidth(500, 900)).toBe(450);
		expect(clampPanelWidth(500, 2000)).toBe(500);
		expect(clampPanelWidth(200, 300)).toBe(MIN_PANEL_WIDTH);
	});

	it('is read back from storage only when it is a sensible number', () => {
		expect(parsePanelWidth('320')).toBe(320);
		expect(parsePanelWidth('9999')).toBe(MAX_PANEL_WIDTH);
		for (const bad of [null, '', 'wide', 'NaN', '-5', '0']) expect(parsePanelWidth(bad)).toBe(DEFAULT_PANEL_WIDTH);
	});

	it('follows the pointer: the panel is what is right of it', () => {
		expect(widthFromPointer(1000, 1400)).toBe(400);
		expect(widthFromPointer(1390, 1400)).toBe(MIN_PANEL_WIDTH);
		expect(widthFromPointer(0, 1400)).toBe(MAX_PANEL_WIDTH);
	});

	it('is nudged by the arrow keys (left makes it wider) and Home and End', () => {
		expect(nudgedWidth(300, 'ArrowLeft')).toBe(316);
		expect(nudgedWidth(300, 'ArrowRight')).toBe(284);
		expect(nudgedWidth(300, 'ArrowLeft', true)).toBe(364);
		expect(nudgedWidth(MIN_PANEL_WIDTH, 'ArrowRight')).toBe(MIN_PANEL_WIDTH);
		expect(nudgedWidth(300, 'Home')).toBe(DEFAULT_PANEL_WIDTH);
		expect(nudgedWidth(300, 'End')).toBe(MAX_PANEL_WIDTH);
		expect(nudgedWidth(300, 'a')).toBeNull();
	});
});

describe('the collapsed sections', () => {
	it('are read back from storage, keeping only names', () => {
		expect(parseCollapsed('["Resin","Objects"]')).toEqual(['Resin', 'Objects']);
		expect(parseCollapsed('["Resin",3,null,"Resin"]')).toEqual(['Resin']);
		for (const bad of [null, '', 'nope', '{"a":1}', '"Resin"']) expect(parseCollapsed(bad)).toEqual([]);
	});

	it('toggle one section at a time', () => {
		expect(toggleCollapsed([], 'Resin')).toEqual(['Resin']);
		expect(toggleCollapsed(['Resin'], 'Objects')).toEqual(['Resin', 'Objects']);
		expect(toggleCollapsed(['Resin', 'Objects'], 'Resin')).toEqual(['Objects']);
	});
});
