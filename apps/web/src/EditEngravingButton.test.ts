import { addShape, createEmptyDesign, type Design, engraveInto, frameOfPlane, type GroupNode } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EditEngravingButtons } from './EditEngravingButton.tsx';

const record = (text: string) => ({
	settings: { text, font: 1, em: 10, angle: 0, at: [0, 0] as [number, number], depth: 1, mode: 'engrave' as const },
	frame: frameOfPlane({ origin: [0, 0, 20], normal: [0, 0, 1] }),
});
const input = { name: 'Engraving "Hi"', ref: 'c'.repeat(64), size: [10, 4, 2] as [number, number, number] };
const bounds = { min: [-5, -2, 19] as [number, number, number], max: [5, 2, 20.5] as [number, number, number] };

const scene = () => addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
const engraved = (): Design => engraveInto(scene(), 'a', input, bounds, 'engrave', { id: 'e', groupId: 'g', record: record('Hi') }).design;
const render = (design: Design, id: string) => renderToStaticMarkup(createElement(EditEngravingButtons, { design, id, onEdit: () => {} }));

describe('EditEngravingButtons', () => {
	it('is a button for a group that holds an engraving', () => {
		const html = render(engraved(), 'g');
		expect(html).toContain('>Edit engraving<');
		expect(html).not.toContain('disabled');
	});

	it('is nothing for a shape, a group with no engraving, or something that is not there', () => {
		expect(render(engraved(), 'a')).toBe('');
		expect(render(scene(), 'a')).toBe('');
		expect(render(engraved(), 'nope')).toBe('');
	});

	it('names each engraving by its words when a group holds more than one', () => {
		const d = engraved();
		const g = d.nodes.g as GroupNode;
		const second = { ...d.nodes.e!, id: 'e2', params: { ...(d.nodes.e as { params: object }).params, engText: 'Bye' } };
		const two = { ...d, nodes: { ...d.nodes, e2: second, g: { ...g, children: [...g.children, 'e2'] } } } as Design;
		const html = render(two, 'g');
		expect(html).toContain('Edit engraving “Hi”');
		expect(html).toContain('Edit engraving “Bye”');
	});

	it('is off, with the reason, while the group is locked', () => {
		const d = engraved();
		const locked = { ...d, nodes: { ...d.nodes, g: { ...d.nodes.g!, locked: true } } } as Design;
		const html = render(locked, 'g');
		expect(html).toContain('disabled');
		expect(html).toMatch(/locked|unlock/i);
	});
});
