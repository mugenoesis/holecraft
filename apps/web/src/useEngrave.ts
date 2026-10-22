import type { Design, MeshData } from '@holecraft/core';
import { type Dispatch, useCallback } from 'react';
import type { EditorAction } from './editorState.ts';
import { type EngraveRequest, runEngrave } from './engraveJob.ts';
import { engraveInWorker } from './geometry/engraveInWorker.ts';
import { importModelFile } from './importModel.ts';
import { uploadMesh } from './meshApi.ts';

/**
 * The Engrave tool's Done: fits the lettering to the shape beneath it in the engine, stores it as an imported model and puts it in the design,
 * grouped with the shape, as one undoable step. It gives null when that worked and the problem in words when it did not (the tool stays open
 * so the lettering can be moved or made smaller).
 */
export function useEngrave(
	design: Design,
	meshes: ReadonlyMap<string, MeshData>,
	addMesh: (ref: string, mesh: MeshData) => void,
	dispatch: Dispatch<EditorAction>,
) {
	return useCallback(
		async (request: EngraveRequest): Promise<string | null> => {
			const out = await runEngrave(request, {
				fit: (r) => engraveInWorker(design, meshes, r),
				read: (file) => importModelFile(file, { upload: uploadMesh }),
			});
			if (out.error !== null) return out.error;
			addMesh(out.input.ref, out.mesh);
			dispatch({ type: 'engrave', target: request.targetId, input: out.input, bounds: out.bounds, mode: request.mode });
			return null;
		},
		[design, meshes, addMesh, dispatch],
	);
}
