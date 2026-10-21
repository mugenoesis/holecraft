import { type Design, type MeshData, type MeshHealth, meshHealth, type NodeId, repairMesh } from '@holecraft/core';
import { type Dispatch, useCallback, useEffect, useMemo, useState } from 'react';
import type { EditorAction } from './editorState.ts';
import { uploadMesh } from './meshApi.ts';
import { repairNote } from './modelCheck.ts';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'The model could not be repaired');

/** The selected node, when it is one imported model: its id, the mesh it uses, and the mesh's reference. */
export function selectedModel(
	design: Design,
	selection: readonly NodeId[],
	meshes: ReadonlyMap<string, MeshData>,
): { id: NodeId; ref: string; mesh: MeshData } | null {
	const id = selection.length === 1 ? selection[0]! : null;
	const node = id ? design.nodes[id] : undefined;
	if (!id || node?.kind !== 'shape' || node.shapeType !== 'mesh') return null;
	const ref = String(node.params.mesh);
	const mesh = meshes.get(ref);
	return mesh ? { id, ref, mesh } : null;
}

/**
 * The Model check of the selected imported model: how it is (checked once for each stored mesh) and a Repair that mends what can be mended,
 * stores the repaired mesh and points the shape at it as one undoable step.
 */
export function useModelCheck(
	design: Design,
	selection: readonly NodeId[],
	meshes: ReadonlyMap<string, MeshData>,
	addMesh: (ref: string, mesh: MeshData) => void,
	dispatch: Dispatch<EditorAction>,
) {
	const model = selectedModel(design, selection, meshes);
	const mesh = model?.mesh;
	const health: MeshHealth | null = useMemo(() => (mesh ? meshHealth(mesh) : null), [mesh]);
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	// what was said about one model is not said about the next
	// biome-ignore lint/correctness/useExhaustiveDependencies: the selected model changing is the trigger
	useEffect(() => {
		setNote(null);
		setError(null);
	}, [model?.id]);

	const repair = useCallback(async () => {
		if (!model) return;
		setBusy(true);
		setError(null);
		try {
			const result = repairMesh(model.mesh);
			if (result.mesh === model.mesh) return setNote(repairNote(result));
			const ref = await uploadMesh(result.mesh);
			addMesh(ref, result.mesh);
			dispatch({ type: 'setMeshRef', id: model.id, ref });
			setNote(repairNote(result));
		} catch (e) {
			setError(messageOf(e));
		} finally {
			setBusy(false);
		}
	}, [model, addMesh, dispatch]);

	return { model, health, busy, note, error, repair };
}
