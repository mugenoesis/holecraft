import type { Diagnostics, RecentEntry, Settings } from './messages.ts';
import { ask, byId, el } from './ui.ts';

/* The settings page: where Holecraft and Trident are, a check of each, what this browser can do, and the downloads the add-on has seen lately. */

const field = (id: string) => byId<HTMLInputElement>(id);

function show(id: string, text: string, problem: boolean) {
	const node = byId(id);
	node.textContent = text;
	node.className = problem ? 'problem' : 'good';
	node.setAttribute('role', problem ? 'alert' : 'status');
}

async function save(): Promise<void> {
	const settings: Settings = {
		holecraftUrl: field('holecraftUrl').value,
		tridentUrl: field('tridentUrl').value,
		tridentKey: field('tridentKey').value,
	};
	const out = await ask<Settings>({ type: 'saveSettings', settings });
	if (!out.ok) return show('saved', out.error, true);
	field('holecraftUrl').value = out.data.holecraftUrl;
	field('tridentUrl').value = out.data.tridentUrl;
	field('tridentKey').value = out.data.tridentKey;
	show('saved', 'Saved', false);
}

async function test(target: 'holecraft' | 'trident') {
	await save();
	show(`${target}Result`, 'Checking…', false);
	const out = await ask<string>({ type: 'test', target });
	show(`${target}Result`, out.ok ? out.data : out.error, !out.ok);
}

async function showDiagnostics() {
	const out = await ask<Diagnostics>({ type: 'diagnostics' });
	if (!out.ok) return;
	byId('diagnostics').replaceChildren(
		...out.data.lines.map((l) =>
			el(
				'li',
				{},
				el('strong', { textContent: `${l.ok ? 'Yes' : l.required ? 'No' : 'Not here'}: ${l.label}` }),
				el('span', { className: 'muted', textContent: l.detail }),
			),
		),
	);
}

async function showRecent() {
	const out = await ask<RecentEntry[]>({ type: 'recent' });
	if (!out.ok) return;
	const list = byId('recent');
	list.replaceChildren(
		...(out.data.length === 0
			? [el('li', { className: 'muted', textContent: 'Nothing yet. Download a model on one of the sites, then come back.' })]
			: out.data.map((e) =>
					el(
						'li',
						{},
						el('strong', { textContent: `${e.site}: ${e.name ?? '(no name)'} ${e.kind ? `(${e.kind})` : ''}` }),
						el('span', { className: 'muted', textContent: e.note }),
						el('code', { textContent: `${e.status} ${e.url} | ${e.contentType} | ${e.disposition}` }),
					),
				)),
	);
}

async function load() {
	const out = await ask<Settings>({ type: 'getSettings' });
	if (out.ok) {
		field('holecraftUrl').value = out.data.holecraftUrl;
		field('tridentUrl').value = out.data.tridentUrl;
		field('tridentKey').value = out.data.tridentKey;
	}
	await Promise.all([showDiagnostics(), showRecent()]);
}

byId('form').addEventListener('submit', (e) => {
	e.preventDefault();
	void save();
});
byId('testHolecraft').addEventListener('click', () => void test('holecraft'));
byId('testTrident').addEventListener('click', () => void test('trident'));
byId('refreshRecent').addEventListener('click', () => void showRecent());
byId('clearRecent').addEventListener('click', () => void ask({ type: 'clearRecent' }).then(showRecent));
void load();
