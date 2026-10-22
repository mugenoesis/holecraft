import type { Reply, Request } from './messages.ts';

/** Asks the background page to do something, and gives its answer (an error if it could not be reached). */
export async function ask<T>(request: Request): Promise<Reply<T>> {
	try {
		return (await browser.runtime.sendMessage(request)) as Reply<T>;
	} catch {
		return { ok: false, error: 'The add-on’s background page did not answer. Try again, or restart the browser.' };
	}
}

/** A small element helper for building the pages. */
export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props: Partial<HTMLElementTagNameMap[K]> = {},
	...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
	const node = Object.assign(document.createElement(tag), props);
	node.append(...children);
	return node;
}

export const byId = <T extends HTMLElement>(id: string): T => {
	const node = document.getElementById(id);
	if (!node) throw new Error(`The page is missing #${id}`);
	return node as T;
};
