import type { State, Target } from './messages.ts';
import { baseName } from './names.ts';

/** A size in plain units. */
export function sizeText(bytes: number | null): string {
	if (bytes === null) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface PopupAction {
	label: string;
	to: Target;
	/** For Trident and a zip: the model in it to send. */
	entry?: string;
	enabled: boolean;
	/** Why it is off, or empty. */
	hint: string;
}

export interface PopupRow {
	id: string;
	title: string;
	detail: string;
	/** Something to tell about this file, or empty. */
	note: string;
	actions: PopupAction[];
}

export interface PopupView {
	/** What to say instead of rows (when there are none), or empty. */
	message: string;
	rows: PopupRow[];
}

type MakeAction = (to: Target, label: string, entry?: string) => PopupAction;

/** The Trident buttons for a file: one for a model, one for a zip with a single model, one per model for a zip with several (none while a zip's contents are not known). */
function tridentChoices(
	kind: 'model' | 'zip',
	models: readonly string[] | undefined,
	action: MakeAction,
): { actions: PopupAction[]; notes: string[] } {
	if (kind === 'model') return { actions: [action('trident', 'Open in Trident')], notes: [] };
	if (!models) return { actions: [], notes: [] };
	if (models.length === 0) return { actions: [], notes: ['There is no model Trident can take in this zip'] };
	if (models.length === 1) return { actions: [action('trident', 'Open in Trident', models[0])], notes: [] };
	return { actions: models.map((m) => action('trident', `Open in Trident: ${baseName(m)}`, m)), notes: [] };
}

/** What the popup shows: a row for each file caught, with a button for each place it can go. `zipModels` has the models in each caught zip, once known (by file id). */
export function popupView(state: State, zipModels: Readonly<Record<string, readonly string[]>>): PopupView {
	if (state.files.length === 0) {
		return { message: 'Nothing yet. Download a model on MakerWorld, Printables or Thingiverse and it will appear here.', rows: [] };
	}
	const action = (to: Target, label: string, entry?: string): PopupAction => {
		const ready = to === 'holecraft' ? state.holecraftReady : state.tridentReady;
		return {
			label,
			to,
			...(entry === undefined ? {} : { entry }),
			enabled: ready,
			hint: ready ? '' : `Set up ${to === 'holecraft' ? 'Holecraft' : 'Trident'} in the add-on’s settings`,
		};
	};
	const rows = state.files.map((f): PopupRow => {
		const { actions, notes } = tridentChoices(f.kind, zipModels[f.id], action);
		if (!f.ready) notes.push('Not copied while it came down: it will be fetched again when you send it');
		return {
			id: f.id,
			title: f.name,
			detail: [f.site, sizeText(f.size)].filter(Boolean).join(' · '),
			note: notes.join('. '),
			actions: [action('holecraft', 'Open in Holecraft'), ...actions],
		};
	});
	return { message: '', rows };
}

/** The row for one caught file, as the popup would show it (null if it is no longer there): what the banner on the page shows. */
export function rowFor(state: State, zipModels: Readonly<Record<string, readonly string[]>>, id: string): PopupRow | null {
	return popupView({ ...state, files: state.files.filter((f) => f.id === id) }, zipModels).rows[0] ?? null;
}

/** The words of the browser's notification when a file is caught. */
export function noticeText(file: { name: string; site: string }): { title: string; message: string } {
	return { title: 'Holecraft Send', message: `${file.name} from ${file.site} is ready to send to Holecraft or Trident. Tap to choose.` };
}
