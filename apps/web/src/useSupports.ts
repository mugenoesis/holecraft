import { type Design, exportObjectCount, type MeshData } from '@holecraft/core';
import { type Dispatch, useCallback, useEffect, useState } from 'react';
import type { EditorAction } from './editorState.ts';
import { exportDeps, exportOrcaBytes } from './exportDesign.ts';
import {
	getTrident,
	listResinPrinters,
	listSavedPrinters,
	placeSupports,
	type ResinPrinter,
	type SavedPrinter,
	type TridentStatus,
} from './tridentApi.ts';

const PRINTER_KEY = 'holecraft.supportPrinter';

function storedPrinter(): string {
	try {
		return localStorage.getItem(PRINTER_KEY) ?? '';
	} catch {
		return '';
	}
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Support points could not be made');

/** Why "Generate support points" cannot be pressed, in words for the panel, or null when it can. */
export function whyNotSupports(design: Design, status: TridentStatus | null, printer: string): string | null {
	if (status && !status.url) return 'Support points are worked out by Trident Studio: set one up under Export, Send to Trident.';
	if (!status) return 'Looking for your Trident…';
	if (exportObjectCount(design) === 0) return 'Add a solid shape to put supports on.';
	if (!printer) return 'Choose the printer the points are for.';
	return null;
}

/** A saved printer as the picker offers it: it stands for the catalogue printer it is, and goes by the name it was saved under. */
export interface SavedChoice {
	printer: string;
	label: string;
}

/** The saved printers whose catalogue printer Trident still lists, each as "gk2 (UniFormation GKtwo)". */
export function savedChoices(saved: readonly SavedPrinter[], printers: readonly ResinPrinter[]): SavedChoice[] {
	return saved
		.filter((s) => printers.some((p) => p.name === s.printer))
		.map((s) => ({ printer: s.printer, label: `${s.name} (${s.printer})` }));
}

/** The printer to start on: the one chosen before if Trident still lists it, else the first saved printer, else none. */
export function startingPrinter(chosen: string, saved: readonly SavedChoice[], printers: readonly ResinPrinter[]): string {
	if (chosen && printers.some((p) => p.name === chosen)) return chosen;
	return saved[0]?.printer ?? '';
}

/** "8 points (6 from Trident, 2 added by you)". */
export function pointsSummary(design: Design): string {
	const points = design.supports?.points ?? [];
	if (points.length === 0) return 'No points yet';
	const added = points.filter((p) => p.type === 'manual').length;
	const made = points.length - added;
	const noun = points.length === 1 ? 'point' : 'points';
	if (added === 0) return `${points.length} ${noun} (from Trident)`;
	if (made === 0) return `${points.length} ${noun} (added by you)`;
	return `${points.length} ${noun} (${made} from Trident, ${added} added by you)`;
}

/**
 * The Supports group of the Resin panel: finds out about Trident and its printers, and "Generate support points" sends the design (as the 3MF
 * Send to Trident sends) to be looked at and takes the points that come back as the design's own.
 */
export function useSupports(design: Design, meshes: ReadonlyMap<string, MeshData>, dispatch: Dispatch<EditorAction>) {
	const [status, setStatus] = useState<TridentStatus | null>(null);
	const [printers, setPrinters] = useState<ResinPrinter[]>([]);
	const [saved, setSaved] = useState<SavedChoice[]>([]);
	const [printer, setPrinterState] = useState(storedPrinter);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let current = true;
		getTrident()
			.then(async (s) => {
				if (!current) return;
				setStatus(s);
				if (!s.url) return;
				const [catalogue, mine] = await Promise.all([listResinPrinters(), listSavedPrinters().catch(() => [])]);
				if (!current) return;
				const choices = savedChoices(mine, catalogue);
				setPrinters(catalogue);
				setSaved(choices);
				setPrinterState((chosen) => startingPrinter(chosen, choices, catalogue));
			})
			.catch((e: unknown) => {
				if (!current) return;
				setStatus((s) => s ?? { url: null, hasKey: false });
				setError(messageOf(e));
			});
		return () => {
			current = false;
		};
	}, []);

	const setPrinter = useCallback((name: string) => {
		setPrinterState(name);
		try {
			localStorage.setItem(PRINTER_KEY, name);
		} catch {
			// private mode: the choice lasts until the page is closed
		}
	}, []);

	const why = whyNotSupports(design, status, printer);

	const generate = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			const file = await exportOrcaBytes(design, exportDeps(meshes));
			dispatch({ type: 'supportsMade', doc: await placeSupports(file, printer) });
		} catch (e) {
			setError(messageOf(e));
		} finally {
			setBusy(false);
		}
	}, [design, meshes, printer, dispatch]);

	return { printers, saved, printer, setPrinter, busy, error, why, generate };
}
