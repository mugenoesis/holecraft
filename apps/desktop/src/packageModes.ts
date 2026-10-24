import { chmod, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const DIR_MODE = 0o755;
const FILE_MODE = 0o644;
const EXECUTABLE_MODE = 0o755;
const ANY_EXECUTE_BIT = 0o111;

/**
 * Gives a packaged app folder the modes an installed app needs: every directory 755, every file 644 (755 when it was executable).
 * Packaging on a host with a restrictive umask (007, 027) leaves directories and files that other users cannot open, and the
 * .deb keeps those modes: /opt/Holecraft was root-only, so nobody else could start the app. The setuid bit goes too; the
 * .deb's own postinst sets chrome-sandbox. Symlinks are left alone.
 */
export async function normalizeModes(dir: string): Promise<void> {
	await chmod(dir, DIR_MODE);
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			await normalizeModes(path);
		} else if (entry.isFile()) {
			const executable = ((await lstat(path)).mode & ANY_EXECUTE_BIT) !== 0;
			await chmod(path, executable ? EXECUTABLE_MODE : FILE_MODE);
		}
	}
}
