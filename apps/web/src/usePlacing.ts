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
	// A finger is dragging a lifted shape over the view (the viewport follows it and puts the shape down where it comes up).
	const [dragging, setDragging] = useState(false);
	// A saved shape has to be opened before it can be lifted: if the finger comes up meanwhile, it is not.
	const touchToken = useRef(0);
	const current = useRef(placing);
	current.current = placing;

	const cancel = useCallback(() => {
		setPlacing(null);
		setDragging(false);
	}, []);
	const place = useCallback(
		(what: Placing, target: PlacementTarget) => {
			setPlacing(null);
			setDragging(false);
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
	// A finger pressed and held a tile: the shape is lifted and follows the finger.
	const lift = useCallback((what: Placing) => {
		touchToken.current += 1;
		setPlacing(what);
		setDragging(true);
	}, []);
	const liftSaved = useCallback(
		async (item: LibrarySummary) => {
			touchToken.current += 1;
			const token = touchToken.current;
			const shape = await openSaved(item.id);
			if (shape && token === touchToken.current) lift({ kind: 'saved', id: item.id, name: item.name, shape });
		},
		[openSaved, lift],
	);
	/** The finger came up (over a tile): a saved shape still being opened is not lifted after all. */
	const release = useCallback(() => {
		touchToken.current += 1;
	}, []);
	return { placing, dragging, arm: setPlacing, armSaved, lift, liftSaved, release, place, cancel };
}
