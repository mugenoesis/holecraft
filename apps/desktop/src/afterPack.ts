import { normalizeModes } from './packageModes.ts';

// electron-builder's afterPack hook: runs on the unpacked app before the AppImage and .deb are made from it.
export default async function afterPack(context: { appOutDir: string }): Promise<void> {
	await normalizeModes(context.appOutDir);
}
