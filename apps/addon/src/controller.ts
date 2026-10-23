import type { CaughtFiles } from './caught.ts';
import { mayDeleteDownload } from './cleanup.ts';
import type { Diagnostics } from './diagnostics.ts';
import type { Reply, Request, State, Target } from './messages.ts';
import { baseName, modelNamesIn, TRIDENT_EXTENSIONS } from './names.ts';
import type { RecentLog } from './recent.ts';
import { SendError, type SendFile, sendToHolecraft, sendToTrident, testHolecraft, testTrident } from './send.ts';
import { parseSettings, type Settings } from './settings.ts';
import { extractZipEntry, listZipEntries } from './zip.ts';

export interface ControllerDeps {
	files: CaughtFiles;
	log: RecentLog;
	loadSettings: () => Promise<Settings>;
	saveSettings: (settings: Settings) => Promise<void>;
	fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
	openTab: (url: string) => Promise<void>;
	diagnose: () => Diagnostics;
	/** Called when the files waiting have changed. */
	onChange: () => void;
	/** The biggest file carried. */
	maxBytes: number;
	/** Deletes the file the browser saved for a caught file, and says what it did. Missing where the browser cannot (Firefox for Android). */
	deleteDownload?: ((file: { url: string; name: string; at: number }) => Promise<string>) | undefined;
}

const ok = <T>(data: T): Reply<T> => ({ ok: true, data });
const fail = (error: unknown): Reply<never> => ({ ok: false, error: error instanceof Error ? error.message : 'Something went wrong' });

/** The background page's work: it answers what the popup and options page ask, and does the sending (so it goes on if the popup closes). */
export function createController(deps: ControllerDeps): (request: Request) => Promise<Reply> {
	/** A caught file's bytes: the ones copied, or the file fetched again with the browser's own login (and then kept). */
	async function bytesOf(id: string): Promise<{ name: string; bytes: Uint8Array; kind: 'model' | 'zip' }> {
		const caught = deps.files.get(id);
		if (!caught) throw new SendError('That file is no longer waiting here. Download it again to send it.');
		if (caught.bytes) return { name: caught.name, bytes: caught.bytes, kind: caught.kind };
		let response: Response;
		try {
			response = await deps.fetchFn(caught.url, { credentials: 'include' });
		} catch {
			throw new SendError('The file could not be downloaded again. Download it once more, then send it from the popup.');
		}
		if (!response.ok)
			throw new SendError(
				`The file could not be downloaded again (${response.status}). Download it once more, then send it from the popup.`,
			);
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length > deps.maxBytes) throw new SendError('The file is too large for the add-on to carry');
		caught.bytes = bytes;
		return { name: caught.name, bytes, kind: caught.kind };
	}

	/** What goes to Trident: a model as it is, or the one chosen out of a zip. */
	async function forTrident(
		file: { name: string; bytes: Uint8Array; kind: 'model' | 'zip' },
		entry: string | undefined,
	): Promise<SendFile> {
		if (file.kind === 'model') return file;
		const entries = listZipEntries(file.bytes);
		const models = modelNamesIn(
			entries.map((e) => e.name),
			TRIDENT_EXTENSIONS,
		);
		if (models.length === 0) throw new SendError('There is no model Trident can take in that zip (it takes STL, 3MF, OBJ and STEP)');
		const chosen = entry ?? (models.length === 1 ? models[0] : undefined);
		if (chosen === undefined) throw new SendError('Which model in the zip? Choose one to send to Trident');
		const found = entries.find((e) => e.name === chosen && models.includes(e.name));
		if (!found) throw new SendError('That model is not in the zip');
		return { name: baseName(found.name), bytes: await extractZipEntry(file.bytes, found) };
	}

	/** Deletes the downloaded file after a send, writing what happened in the log: a failure here never undoes the sending. */
	async function removeDownloaded(caught: { name: string; url: string; site: string; at: number }): Promise<void> {
		if (!deps.deleteDownload) return;
		let note: string;
		try {
			note = await deps.deleteDownload({ url: caught.url, name: caught.name, at: caught.at });
		} catch (error) {
			note = `Could not delete the downloaded file: ${error instanceof Error ? error.message : 'unknown problem'}`;
		}
		deps.log.add({
			at: Date.now(),
			site: caught.site,
			url: '',
			status: 200,
			contentType: '',
			disposition: '',
			name: caught.name,
			kind: null,
			note,
		});
	}

	async function send(id: string, to: Target, entry: string | undefined): Promise<Reply> {
		const settings = await deps.loadSettings();
		const file = await bytesOf(id);
		const { openUrl } =
			to === 'holecraft'
				? await sendToHolecraft(settings, file, deps.fetchFn)
				: await sendToTrident(settings, await forTrident(file, entry), deps.fetchFn);
		const caught = deps.files.get(id);
		deps.files.remove(id);
		deps.onChange();
		if (caught && settings.deleteAfterSend && mayDeleteDownload(caught.kind, to)) await removeDownloaded(caught);
		await deps.openTab(openUrl);
		return ok(null);
	}

	async function handle(request: Request): Promise<Reply> {
		switch (request.type) {
			case 'state': {
				const s = await deps.loadSettings();
				return ok<State>({ files: deps.files.list(), holecraftReady: s.holecraftUrl !== '', tridentReady: s.tridentUrl !== '' });
			}
			case 'zipModels': {
				const file = await bytesOf(request.id);
				if (file.kind !== 'zip') return ok({ models: [] });
				return ok({
					models: modelNamesIn(
						listZipEntries(file.bytes).map((e) => e.name),
						TRIDENT_EXTENSIONS,
					),
				});
			}
			case 'send':
				return send(request.id, request.to, request.entry);
			case 'dismiss':
				deps.files.remove(request.id);
				deps.onChange();
				return ok(null);
			case 'getSettings':
				return ok(await deps.loadSettings());
			case 'saveSettings': {
				const saved = parseSettings(request.settings);
				await deps.saveSettings(saved);
				return ok(saved);
			}
			case 'test': {
				const s = await deps.loadSettings();
				return ok(request.target === 'holecraft' ? await testHolecraft(s, deps.fetchFn) : await testTrident(s, deps.fetchFn));
			}
			case 'recent':
				return ok(deps.log.list());
			case 'clearRecent':
				deps.log.clear();
				return ok(null);
			case 'diagnostics':
				return ok(deps.diagnose());
		}
	}

	return async (request) => {
		try {
			return await handle(request);
		} catch (error) {
			return fail(error);
		}
	};
}
