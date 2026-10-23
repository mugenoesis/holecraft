import type { State } from './messages.ts';
import { type PopupAction, type PopupRow, rowFor } from './popupModel.ts';
import { ask } from './ui.ts';

/*
 * The banner that appears on the page a file came down in, with the buttons to send it to Holecraft or Trident (the same ones the toolbar button's
 * popup has). It is put on the page by the background page, once for each file caught. It lives in a shadow root, so nothing on the page can
 * restyle it or reach into it. The words and buttons come from popupModel.ts.
 */

const HOST_ID = 'holecraft-send-banner';
const CSS = `
:host { all: initial; }
.stack { position: fixed; z-index: 2147483647; left: 12px; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; font: 14px/1.4 system-ui, sans-serif; }
.card { pointer-events: auto; box-sizing: border-box; width: 100%; max-width: 30rem; padding: 12px 14px; border-radius: 10px; background: #14232b; color: #f2f6f8; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4); }
.title { font-weight: 600; overflow-wrap: anywhere; }
.detail, .note { color: #b5c3cb; font-size: 13px; }
.problem { color: #ffb4a8; margin-top: 6px; }
.buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
button { font: inherit; min-height: 40px; padding: 6px 12px; border-radius: 8px; border: 1px solid #4a6270; background: transparent; color: inherit; cursor: pointer; }
button.primary { background: #2dd4bf; border-color: #2dd4bf; color: #06201c; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.quiet { border-color: transparent; color: #b5c3cb; }
`;

function element<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Partial<HTMLElementTagNameMap[K]> = {},
	...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
	const node = Object.assign(document.createElement(tag), props);
	node.append(...children);
	return node;
}

/** The shadow root all the banners live in, made the first time it is needed. */
function stack(): HTMLElement {
	let host = document.getElementById(HOST_ID);
	if (!host) {
		host = element('div', { id: HOST_ID });
		const root = host.attachShadow({ mode: 'open' });
		root.append(element('style', { textContent: CSS }), element('div', { className: 'stack' }));
		document.documentElement.append(host);
	}
	return host.shadowRoot!.querySelector('.stack') as HTMLElement;
}

async function lookUp(id: string): Promise<PopupRow | null> {
	const state = await ask<State>({ type: 'state' });
	if (!state.ok) return null;
	const file = state.data.files.find((f) => f.id === id);
	const zipModels: Record<string, string[]> = {};
	if (file?.kind === 'zip') {
		const models = await ask<{ models: string[] }>({ type: 'zipModels', id });
		zipModels[id] = models.ok ? models.data.models : [];
	}
	return rowFor(state.data, zipModels, id);
}

function show(row: PopupRow) {
	const card = element('div', { className: 'card', role: 'status' });
	const problem = element('div', { className: 'problem', hidden: true });
	problem.setAttribute('role', 'alert');
	const buttons = element('div', { className: 'buttons' });
	const all: HTMLButtonElement[] = [];
	const send = async (action: PopupAction) => {
		for (const b of all) b.disabled = true;
		problem.hidden = true;
		const out = await ask({ type: 'send', id: row.id, to: action.to, ...(action.entry === undefined ? {} : { entry: action.entry }) });
		if (out.ok) return card.remove();
		problem.textContent = out.error;
		problem.hidden = false;
		for (const b of all) b.disabled = false;
	};
	for (const [i, action] of row.actions.entries()) {
		const button = element('button', {
			type: 'button',
			textContent: action.label,
			disabled: !action.enabled,
			title: action.hint,
			className: i === 0 ? 'primary' : '',
			onclick: () => void send(action),
		});
		all.push(button);
		buttons.append(button);
	}
	buttons.append(element('button', { type: 'button', className: 'quiet', textContent: 'Hide', onclick: () => card.remove() }));
	card.append(
		element('div', { className: 'title', textContent: `Caught ${row.title}` }),
		element('div', { className: 'detail', textContent: row.detail }),
		...(row.note ? [element('div', { className: 'note', textContent: row.note })] : []),
		problem,
		buttons,
	);
	stack().append(card);
}

const guarded = window as unknown as { __holecraftSendBanner?: boolean };
// the page may be given this script more than once (once for each file caught): one listener is enough
if (!guarded.__holecraftSendBanner) {
	guarded.__holecraftSendBanner = true;
	browser.runtime.onMessage.addListener((message: unknown) => {
		const m = message as { type?: string; id?: string };
		if (m.type === 'holecraft-send-banner' && typeof m.id === 'string') void lookUp(m.id).then((row) => row && show(row));
	});
}
