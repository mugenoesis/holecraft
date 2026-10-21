import { type Design, groupToMerge, type MeshData, type MeshShapeInput, type NodeId, whyNotMerge } from '@holecraft/core';
import { type Dispatch, useCallback, useState } from 'react';
import type { EditorAction } from './editorState.ts';
import { exportDeps, exportStlBytes, onlySelected } from './exportDesign.ts';
import { importModelFile } from './importModel.ts';
import { uploadMesh } from './meshApi.ts';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'The shapes could not be merged');

/** The merged solid's name: that of the first of the shapes, then "merged". */
const nameOf = (design: Design, selection: readonly NodeId[]): string => {
	const first = design.roots.find((id) => selection.includes(id));
	return `${(first && design.nodes[first]?.name) || 'Shape'} merged`.slice(0, 100);
};

/**
 * Merge: the selected shapes (or one group) are joined as a group the geometry engine works out (a hole among them cuts), exported as an STL, read
 * back as an imported model and put in place of the shapes as one undoable step. It is the same road a hollowed model takes, so the result is
 * an ordinary imported-model shape.
 */
export function useMerge(
	design: Design,
	selection: readonly NodeId[],
	meshes: ReadonlyMap<string, MeshData>,
	addMesh: (ref: string, mesh: MeshData) => void,
	dispatch: Dispatch<EditorAction>,
) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const why = whyNotMerge(design, selection);

	const merge = useCallback(async () => {
		const grouped = groupToMerge(design, selection);
		if (grouped.id === null) return;
		setBusy(true);
		setError(null);
		try {
			const built = await exportStlBytes(onlySelected(grouped.design, [grouped.id]), exportDeps(meshes));
			const bytes = built.data;
			const model = {
				name: 'merged.stl',
				size: bytes.byteLength,
				arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
			};
			const { input, mesh } = await importModelFile(model, { upload: uploadMesh });
			const named: MeshShapeInput = { ...input, name: nameOf(design, selection) };
			addMesh(named.ref, mesh);
			dispatch({ type: 'mergeToMesh', ids: [...selection], input: named });
		} catch (e) {
			setError(messageOf(e));
		} finally {
			setBusy(false);
		}
	}, [design, selection, meshes, addMesh, dispatch]);

	return { why, busy, error, merge, clearError: () => setError(null) };
}

export type MergeUi = ReturnType<typeof useMerge>;
