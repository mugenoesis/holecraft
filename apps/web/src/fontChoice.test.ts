import { describe, expect, it, vi } from 'vitest';
import { chooseFont } from './fontChoice.ts';

describe('chooseFont', () => {
	it('applies the choice once the font is loaded, so the words can be measured in it', async () => {
		const apply = vi.fn();
		await chooseFont(4, apply);
		expect(apply).toHaveBeenCalledTimes(1);
	});

	it('does nothing for an id that is not a font', async () => {
		const apply = vi.fn();
		await chooseFont(99, apply);
		expect(apply).not.toHaveBeenCalled();
	});

	it('loads the font before applying it', async () => {
		const { fontLoaded } = await import('@holecraft/core');
		let loadedWhenApplied = false;
		await chooseFont(7, () => {
			loadedWhenApplied = fontLoaded(7);
		});
		expect(loadedWhenApplied).toBe(true);
	});
});
