import type { State } from './messages.ts';
import { type PopupAction, popupView } from './popupModel.ts';
import { ask, byId, el } from './ui.ts';

/* The popup: the files caught while you browsed, each with buttons to open it in Holecraft or Trident. The words and buttons come from popupModel.ts. */

const zipModels: Record<string, string[]> = {};
let state: State | null = null;
let busy = false;

function say(text: string, problem = false) {
	const status = byId('status');
	status.textContent = text;
	status.className = problem ? 'problem' : 'muted';
	status.setAttribute('role', problem ? 'alert' : 'status');
}

async function send(id: string, action: PopupAction) {
	busy = true;
	render();
	say('Sending…');
	const out = await ask({ type: 'send', id, to: action.to, ...(action.entry === undefined ? {} : { entry: action.entry }) });
	busy = false;
	if (out.ok) {
		window.close();
		return;
	}
	say(out.error, true);
	render();
}

function render() {
	if (!state) return;
	const view = popupView(state, zipModels);
	byId('message').textContent = view.message;
	const list = byId('files');
	list.replaceChildren(
		...view.rows.map((row) =>
			el(
				'li',
				{},
				el('strong', { textContent: row.title }),
				el('span', { className: 'muted', textContent: row.detail }),
				...(row.note ? [el('span', { className: 'muted', textContent: row.note })] : []),
				el(
					'div',
					{ className: 'buttons' },
					...row.actions.map((a) =>
						el('button', {
							type: 'button',
							textContent: a.label,
							disabled: busy || !a.enabled,
							title: a.hint,
							onclick: () => void send(row.id, a),
						}),
					),
					el('button', { type: 'button', className: 'quiet', textContent: 'Dismiss', disabled: busy, onclick: () => void dismiss(row.id) }),
				),
			),
		),
	);
}

async function dismiss(id: string) {
	await ask({ type: 'dismiss', id });
	await load();
}

async function load() {
	const out = await ask<State>({ type: 'state' });
	if (!out.ok) return say(out.error, true);
	state = out.data;
	render();
	// the models inside each zip are listed (for Trident) as soon as they can be
	for (const f of state.files.filter((x) => x.kind === 'zip' && !(x.id in zipModels))) {
		const models = await ask<{ models: string[] }>({ type: 'zipModels', id: f.id });
		zipModels[f.id] = models.ok ? models.data.models : [];
		render();
	}
}

byId('settings').addEventListener('click', () => void browser.runtime.openOptionsPage());
void load();
