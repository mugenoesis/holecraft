import { type Design, type LibrarySummary, libraryShapeOf, type NodeId } from '@holecraft/core';
import { useCallback, useEffect, useState } from 'react';
import { deleteLibraryShape, getLibraryShape, listLibrary, renameLibraryShape, saveToLibrary } from './libraryApi.ts';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong');

/** What the editor can do with the library of saved shapes. */
export interface Library {
	items: LibrarySummary[];
	/** Why the last thing failed, until the next one succeeds. */
	problem: string | null;
	/** Saves the shape or group `id` of `design` as `name`; true when it worked. */
	save: (design: Design, id: NodeId, name: string) => Promise<boolean>;
	/** The saved shape as a design to add, or null (with the problem set) if it could not be opened. */
	open: (id: string) => Promise<Design | null>;
	rename: (id: string, name: string) => Promise<void>;
	remove: (id: string) => Promise<void>;
}

/** The shapes saved to the library (shared by every design), listed once on opening and kept up to date as they are saved, renamed or deleted. */
export function useLibrary(): Library {
	const [items, setItems] = useState<LibrarySummary[]>([]);
	const [problem, setProblem] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setItems(await listLibrary());
			setProblem(null);
		} catch (error) {
			setProblem(messageOf(error));
		}
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);

	const run = useCallback(
		async (task: () => Promise<unknown>): Promise<boolean> => {
			try {
				await task();
				await refresh();
				return true;
			} catch (error) {
				setProblem(messageOf(error));
				return false;
			}
		},
		[refresh],
	);

	return {
		items,
		problem,
		save: (design, id, name) => {
			const shape = libraryShapeOf(design, id, name);
			return shape ? run(() => saveToLibrary(name, shape)) : Promise.resolve(false);
		},
		open: async (id) => {
			try {
				return await getLibraryShape(id);
			} catch (error) {
				setProblem(messageOf(error));
				return null;
			}
		},
		rename: async (id, name) => void (await run(() => renameLibraryShape(id, name))),
		remove: async (id) => void (await run(() => deleteLibraryShape(id))),
	};
}
