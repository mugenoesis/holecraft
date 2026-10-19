import type { Design, LibrarySummary } from '@holecraft/core';
import { type Dispatch, useCallback, useRef, useState } from 'react';
import type { EditorAction } from './editorState.ts';
import { type Placing, placementAction } from './placing.ts';
import type { PlacementTarget } from './viewport/placement.ts';

/**
 * Putting a shape down with the mouse: the Shapes panel arms a shape (or a saved one, opened from the library first), the viewport shows its
 * ghost under the pointer, and the next click on the plate puts it down there, once (that is `place`). `cancel` lets go of it.
 */
export function usePlacing(dispatch: Dispatch<EditorAction>, openSaved: (id: string) => Promise<Design | null>) {
	const [placing, setPlacing] = useState<Placing | null>(null);
	const current = useRef(placing);
	current.current = placing;

	const cancel = useCallback(() => setPlacing(null), []);
	const place = useCallback(
		(what: Placing, target: PlacementTarget) => {
			setPlacing(null);
			dispatch(placementAction(what, target));
		},
		[dispatch],
	);
	// A second click on the armed saved shape lets go of it.
	const armSaved = useCallback(
		async (item: LibrarySummary) => {
			if (current.current?.kind === 'saved' && current.current.id === item.id) return setPlacing(null);
			const shape = await openSaved(item.id);
			if (shape) setPlacing({ kind: 'saved', id: item.id, name: item.name, shape });
		},
		[openSaved],
	);
	return { placing, arm: setPlacing, armSaved, place, cancel };
}
