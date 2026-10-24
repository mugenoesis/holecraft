import { chmod, mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeModes } from './packageModes.ts';

const modeOf = async (path: string) => (await stat(path)).mode & 0o7777;

describe('normalizeModes', () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'holecraft-modes-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('opens the directories and files that a restrictive umask closed to other users', async () => {
		await mkdir(join(root, 'resources'));
		await writeFile(join(root, 'resources', 'app.asar'), 'asar');
		await writeFile(join(root, 'holecraft.png'), 'png');
		await chmod(root, 0o750);
		await chmod(join(root, 'resources'), 0o750);
		await chmod(join(root, 'resources', 'app.asar'), 0o640);
		await chmod(join(root, 'holecraft.png'), 0o660);

		await normalizeModes(root);

		expect(await modeOf(root)).toBe(0o755);
		expect(await modeOf(join(root, 'resources'))).toBe(0o755);
		expect(await modeOf(join(root, 'resources', 'app.asar'))).toBe(0o644);
		expect(await modeOf(join(root, 'holecraft.png'))).toBe(0o644);
	});

	it('keeps a file executable when any executable bit was set', async () => {
		await writeFile(join(root, 'holecraft'), 'bin');
		await writeFile(join(root, 'owner-only'), 'bin');
		await chmod(join(root, 'holecraft'), 0o750);
		await chmod(join(root, 'owner-only'), 0o700);

		await normalizeModes(root);

		expect(await modeOf(join(root, 'holecraft'))).toBe(0o755);
		expect(await modeOf(join(root, 'owner-only'))).toBe(0o755);
	});

	it('takes away write access from group and others and drops setuid bits', async () => {
		await writeFile(join(root, 'chrome-sandbox'), 'bin');
		await writeFile(join(root, 'data.pak'), 'pak');
		await chmod(join(root, 'chrome-sandbox'), 0o4775);
		await chmod(join(root, 'data.pak'), 0o666);

		await normalizeModes(root);

		expect(await modeOf(join(root, 'chrome-sandbox'))).toBe(0o755);
		expect(await modeOf(join(root, 'data.pak'))).toBe(0o644);
	});

	it('leaves a symlink and its target outside the tree alone', async () => {
		const outside = await mkdtemp(join(tmpdir(), 'holecraft-modes-outside-'));
		try {
			await writeFile(join(outside, 'target'), 'x');
			await chmod(join(outside, 'target'), 0o600);
			await symlink(join(outside, 'target'), join(root, 'link'));

			await normalizeModes(root);

			expect(await modeOf(join(outside, 'target'))).toBe(0o600);
		} finally {
			await rm(outside, { recursive: true, force: true });
		}
	});
});
