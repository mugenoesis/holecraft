import type { Design, MeshData, NodeId } from '@holecraft/core';
import type { ClosedCavity } from '@holecraft/geometry';
import { type Dispatch, useCallback, useEffect, useState } from 'react';
import { runFill } from './cavityFill.ts';
import type { EditorAction } from './editorState.ts';
import { importModelFile } from './importModel.ts';
import { uploadMesh } from './meshApi.ts';
import { cavityTarget, useClosedCavity } from './useClosedCavity.ts';

/**
 * What the Resin panel's cavity list and the view share: the closed cavities of the selected shape, whether they show, and which one is chosen.
 * `fill` plugs cavities with a solid shape grouped with the model (one undo step) and gives null when that worked, else the problem in words.
 */
export function useCavityUi(
	design: Design,
	selection: readonly NodeId[],
	meshes: ReadonlyMap<string, MeshData>,
	addMesh: (ref: string, mesh: MeshData) => void,
	dispatch: Dispatch<EditorAction>,
) {
	const cavities = useClosedCavity(design, selection, meshes);
	const [show, setShow] = useState(true);
	const [selected, setSelected] = useState<number | null>(null);
	const [busy, setBusy] = useState(false);
	const target = cavityTarget(design, selection);

	// a cavity that is gone (filled, or the shape changed) is no longer chosen
	const chosenExists = selected !== null && cavities.some((c) => c.id === selected);
	useEffect(() => {
		if (selected !== null && !chosenExists) setSelected(null);
	}, [selected, chosenExists]);

	const fill = useCallback(
		async (which: readonly ClosedCavity[]): Promise<string | null> => {
			if (!target) return 'Select the shape to fill';
			setBusy(true);
			const out = await runFill(which, { read: (file) => importModelFile(file, { upload: uploadMesh }) });
			setBusy(false);
			if (out.error !== null) return out.error;
			addMesh(out.input.ref, out.mesh);
			dispatch({ type: 'engrave', target, input: out.input, bounds: out.bounds, mode: 'raised' });
			return null;
		},
		[target, addMesh, dispatch],
	);

	return { cavities, target, show, setShow, selected: chosenExists ? selected : null, setSelected, busy, fill };
}

export type CavityUi = ReturnType<typeof useCavityUi>;
