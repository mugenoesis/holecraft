import { loadFont } from '@holecraft/core';

/**
 * Picking a font: its letters have to be loaded before the words can be measured in it, so `apply` (which makes the choice) runs once they are.
 * The first time a font is picked this is a short wait for its file; after that it is immediate. An id that is not a font applies nothing.
 */
export async function chooseFont(id: number, apply: () => void): Promise<void> {
	if (await loadFont(id)) apply();
}
