/*
 * Leaving the editor saves whatever was still waiting, in the background. The designs list must not
 * load until that save has landed, or it can show the old name or object count.
 */
let leaving: Promise<unknown> = Promise.resolve();

/** Remember a save that is happening because the editor is being left. */
export function trackLeaving(save: Promise<unknown>): void {
	leaving = save;
}

/** Resolves once the save started on leaving the editor (if any) has finished, successfully or not. */
export async function afterLeaving(): Promise<void> {
	await leaving.catch(() => undefined);
}
