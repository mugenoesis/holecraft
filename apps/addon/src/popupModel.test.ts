import { describe, expect, it } from 'vitest';
import type { State } from './messages.ts';
import { noticeText, popupView, rowFor, sizeText } from './popupModel.ts';

const file = (over: Record<string, unknown> = {}) => ({
	id: 'f1',
	name: 'Gear.stl',
	kind: 'model' as const,
	size: 2048,
	site: 'MakerWorld',
	at: 1,
	ready: true,
	...over,
});
const state = (over: Partial<State> = {}): State => ({ files: [file()], holecraftReady: true, tridentReady: true, ...over });

describe('sizeText', () => {
	it('says the size in plain units', () => {
		expect(sizeText(null)).toBe('');
		expect(sizeText(500)).toBe('500 B');
		expect(sizeText(2048)).toBe('2.0 kB');
		expect(sizeText(1_500_000)).toBe('1.4 MB');
		expect(sizeText(0)).toBe('0 B');
	});
});

describe('popupView', () => {
	it('says what to do when nothing has been caught', () => {
		const v = popupView(state({ files: [] }), {});
		expect(v.rows).toEqual([]);
		expect(v.message).toMatch(/download a model/i);
		expect(v.message).toMatch(/MakerWorld, Printables or Thingiverse/);
	});

	it('has a row for a model, with where it came from and its size, and a button for each place it can go', () => {
		const v = popupView(state(), {});
		expect(v.message).toBe('');
		expect(v.rows).toHaveLength(1);
		expect(v.rows[0]).toMatchObject({ id: 'f1', title: 'Gear.stl', detail: 'MakerWorld · 2.0 kB' });
		expect(v.rows[0]?.actions).toEqual([
			{ label: 'Open in Holecraft', to: 'holecraft', enabled: true, hint: '' },
			{ label: 'Open in Trident', to: 'trident', enabled: true, hint: '' },
		]);
	});

	it('turns off a button, and says why, for a place that is not set up', () => {
		const v = popupView(state({ holecraftReady: false }), {});
		expect(v.rows[0]?.actions[0]).toEqual({
			label: 'Open in Holecraft',
			to: 'holecraft',
			enabled: false,
			hint: 'Set up Holecraft in the add-on’s settings',
		});
		expect(v.rows[0]?.actions[1]?.enabled).toBe(true);
	});

	it('sends a zip to Holecraft whole, and offers each model in it for Trident', () => {
		const zip = file({ id: 'z', name: 'Pack.zip', kind: 'zip', size: null });
		const v = popupView(state({ files: [zip] }), { z: ['a.stl', 'sub/b.3mf'] });
		expect(v.rows[0]?.actions).toEqual([
			{ label: 'Open in Holecraft', to: 'holecraft', enabled: true, hint: '' },
			{ label: 'Open in Trident: a.stl', to: 'trident', entry: 'a.stl', enabled: true, hint: '' },
			{ label: 'Open in Trident: b.3mf', to: 'trident', entry: 'sub/b.3mf', enabled: true, hint: '' },
		]);
	});

	it('is a single Open in Trident for a zip with one model, and none for a zip with nothing Trident takes', () => {
		const zip = file({ id: 'z', name: 'Pack.zip', kind: 'zip' });
		const one = popupView(state({ files: [zip] }), { z: ['only.stl'] });
		expect(one.rows[0]?.actions.map((a) => a.label)).toEqual(['Open in Holecraft', 'Open in Trident']);
		expect(one.rows[0]?.actions[1]).toMatchObject({ entry: 'only.stl' });
		const none = popupView(state({ files: [zip] }), { z: [] });
		expect(none.rows[0]?.actions.map((a) => a.label)).toEqual(['Open in Holecraft']);
		expect(none.rows[0]?.note).toMatch(/no model Trident can take/i);
	});

	it('does not yet offer Trident for a zip whose contents are not known', () => {
		const zip = file({ id: 'z', name: 'Pack.zip', kind: 'zip' });
		const v = popupView(state({ files: [zip] }), {});
		expect(v.rows[0]?.actions.map((a) => a.to)).toEqual(['holecraft']);
	});

	it('says when a file’s bytes were not copied and it will be fetched again', () => {
		const v = popupView(state({ files: [file({ ready: false })] }), {});
		expect(v.rows[0]?.note).toMatch(/fetched again/i);
	});

	it('is newest first, as it is given', () => {
		const v = popupView(state({ files: [file({ id: 'b', name: 'B.stl' }), file({ id: 'a', name: 'A.stl' })] }), {});
		expect(v.rows.map((r) => r.id)).toEqual(['b', 'a']);
	});
});

describe('rowFor', () => {
	it('is the row of one caught file, with the same buttons the popup gives it', () => {
		const s = state({ files: [file({ id: 'a', name: 'A.stl' }), file({ id: 'b', name: 'B.stl' })] });
		const row = rowFor(s, {}, 'b');
		expect(row?.id).toBe('b');
		expect(row?.title).toBe('B.stl');
		expect(row?.actions.map((a) => a.label)).toEqual(['Open in Holecraft', 'Open in Trident']);
	});

	it('is null for a file that is no longer there', () => {
		expect(rowFor(state(), {}, 'nope')).toBeNull();
	});

	it('follows the same rules for a zip as the popup: a button for each model when they are known', () => {
		const zip = file({ id: 'z', name: 'Pack.zip', kind: 'zip' });
		const row = rowFor(state({ files: [zip] }), { z: ['a.stl', 'b.stl'] }, 'z');
		expect(row?.actions.map((a) => a.label)).toEqual(['Open in Holecraft', 'Open in Trident: a.stl', 'Open in Trident: b.stl']);
	});
});

describe('noticeText', () => {
	it('says what was caught and where from, and what to do', () => {
		const text = noticeText(file({ name: 'Gear.stl', site: 'MakerWorld' }));
		expect(text.title).toBe('Holecraft Send');
		expect(text.message).toContain('Gear.stl');
		expect(text.message).toContain('MakerWorld');
		expect(text.message).toMatch(/send/i);
	});
});
