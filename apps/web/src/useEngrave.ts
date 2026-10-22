import type { Design, EngraveRecord, MeshData, NodeId } from '@holecraft/core';
import { type Dispatch, useCallback } from 'react';
import type { EditorAction } from './editorState.ts';
import { type EngraveRequest, runEngrave } from './engraveJob.ts';
import { engraveInWorker } from './geometry/engraveInWorker.ts';
import { importModelFile } from './importModel.ts';
import { uploadMesh } from './meshApi.ts';

/** An engraving being edited: which shape it is, what it remembers (its plane stays as it is) and the design to fit to, which has it left out. */
export interface EngraveEditJob {
	nodeId: NodeId;
	record: EngraveRecord;
	fitDesign: Design;
}

/**
 * The Engrave tool's Done: fits the lettering to the shape beneath it in the engine, stores it as an imported model and puts it in the design,
 * grouped with the shape, as one undoable step (or, when editing, swaps it for the engraving it replaces). It gives null when that worked and the problem in words when it did not (the tool stays open
 * so the lettering can be moved or made smaller).
 */
export function useEngrave(
	design: Design,
	meshes: ReadonlyMap<string, MeshData>,
	addMesh: (ref: string, mesh: MeshData) => void,
	dispatch: Dispatch<EditorAction>,
) {
	return useCallback(
		async (request: EngraveRequest, edit?: EngraveEditJob): Promise<string | null> => {
			const out = await runEngrave(request, {
				fit: (r) => engraveInWorker(edit?.fitDesign ?? design, meshes, r),
				read: (file) => importModelFile(file, { upload: uploadMesh }),
			});
			if (out.error !== null) return out.error;
			addMesh(out.input.ref, out.mesh);
			if (edit) {
				dispatch({
					type: 'reengrave',
					id: edit.nodeId,
					input: out.input,
					bounds: out.bounds,
					record: { settings: request.settings, frame: edit.record.frame },
				});
			} else {
				const record = { settings: request.settings, frame: request.frame };
				dispatch({ type: 'engrave', target: request.targetId, input: out.input, bounds: out.bounds, mode: request.mode, record });
			}
			return null;
		},
		[design, meshes, addMesh, dispatch],
	);
}
