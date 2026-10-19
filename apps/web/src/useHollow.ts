import { canReplaceWithMesh, type Design, type MeshData, type MeshShapeInput, type NodeId } from '@holecraft/core';
import { type Dispatch, useCallback, useEffect, useState } from 'react';
import type { EditorAction } from './editorState.ts';
import { exportDeps, exportStlBytes, onlySelected } from './exportDesign.ts';
import { importModelFile } from './importModel.ts';
import { uploadMesh } from './meshApi.ts';
import { getTrident, hollowModel, type TridentStatus } from './tridentApi.ts';

/** How carefully the slicer works out the cavity (0 to 1): a faster try is rougher. */
const ACCURACY = { fast: 0.25, normal: 0.5, fine: 0.75 } as const;
export type Accuracy = keyof typeof ACCURACY;

export const MIN_WALL = 0.5;
export const MAX_WALL = 20;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'The model could not be hollowed');

/** "Hollowed: 8,000 to 3,900 mm3, 51% less resin" */
export function savingNote(before: number, after: number): string {
	const mm3 = (v: number) => Math.round(v).toLocaleString('en');
	const saved = before > 0 ? Math.round((1 - after / before) * 100) : 0;
	return `Hollowed: ${mm3(before)} to ${mm3(after)} mm³, ${saved}% less resin.`;
}

/** Why Hollow cannot be pressed, in words for the panel, or null when it can. */
export function whyNotHollow(design: Design, selection: readonly NodeId[], status: TridentStatus | null, wall: number): string | null {
	if (status && !status.url) return 'Hollowing is done by Trident Studio: set one up under Export, Send to Trident.';
	const id = selection.length === 1 ? selection[0]! : null;
	const node = id ? design.nodes[id] : undefined;
	if (!id || !node || !canReplaceWithMesh(design, id)) return 'Select one shape or group to hollow it.';
	if (node.mode === 'hole') return 'A hole cannot be hollowed: select a solid.';
	if (!(wall >= MIN_WALL && wall <= MAX_WALL)) return `The wall must be between ${MIN_WALL} and ${MAX_WALL} mm.`;
	if (!status) return 'Looking for your Trident…';
	return null;
}

/**
 * The Hollow button: the selected shape is exported as an STL, sent through Holecraft's server to the Trident slicer to be hollowed, and
 * what comes back (the same model with a cavity, in the same place) takes the shape's place as one undoable step.
 */
export function useHollow(
	design: Design,
	selection: readonly NodeId[],
	meshes: ReadonlyMap<string, MeshData>,
	addMesh: (ref: string, mesh: MeshData) => void,
	dispatch: Dispatch<EditorAction>,
) {
	const [status, setStatus] = useState<TridentStatus | null>(null);
	const [wall, setWall] = useState('2');
	const [accuracy, setAccuracy] = useState<Accuracy>('normal');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [note, setNote] = useState<string | null>(null);

	// Trident can be set up or changed in the Export menu at any time, so ask again when the selection changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the selection changing is the trigger
	useEffect(() => {
		getTrident()
			.then(setStatus)
			.catch(() => setStatus({ url: null, hasKey: false }));
	}, [selection]);

	const wallValue = Number(wall);
	const why = whyNotHollow(design, selection, status, wall.trim() === '' ? Number.NaN : wallValue);

	const hollow = useCallback(async () => {
		const id = selection[0];
		const node = id ? design.nodes[id] : undefined;
		if (!id || !node) return;
		setBusy(true);
		setError(null);
		setNote(null);
		try {
			const file = await exportStlBytes(onlySelected(design, [id]), exportDeps(meshes));
			const made = await hollowModel(file, { wall: wallValue, quality: ACCURACY[accuracy] });
			const model = { name: `${node.name} hollow.stl`, size: made.stl.byteLength, arrayBuffer: async () => made.stl };
			const { input, mesh } = await importModelFile(model, { upload: uploadMesh });
			const named: MeshShapeInput = { ...input, name: `${node.name} (hollow)`.slice(0, 100) };
			addMesh(named.ref, mesh);
			dispatch({ type: 'replaceWithMesh', id, input: named });
			setNote(savingNote(made.volumeBefore, made.volumeAfter));
		} catch (e) {
			setError(messageOf(e));
		} finally {
			setBusy(false);
		}
	}, [selection, design, meshes, wallValue, accuracy, addMesh, dispatch]);

	return { wall, setWall, accuracy, setAccuracy, busy, error, note, why, hollow };
}
