import type { Design } from '@holecraft/core';
import { useCallback, useEffect, useState } from 'react';

/** What the support points' controls and the view share: whether the points show, whether a click adds one, and which one is chosen. */
export function useSupportsUi(design: Design) {
	const [show, setShow] = useState(true);
	const [adding, setAdding] = useState(false);
	const [selected, setSelected] = useState<string | null>(null);

	// a point that is gone (deleted, undone, the design changed) is no longer chosen
	const chosenExists = selected !== null && !!design.supports?.points.some((p) => p.id === selected);
	useEffect(() => {
		if (selected !== null && !chosenExists) setSelected(null);
	}, [selected, chosenExists]);
	// with no points, there is nothing to show or choose, and a click should not add one by surprise
	const none = !design.supports;
	useEffect(() => {
		if (none) setAdding(false);
	}, [none]);

	const toggleAdding = useCallback(() => setAdding((on) => !on), []);
	return { show, setShow, adding, setAdding, toggleAdding, selected: chosenExists ? selected : null, setSelected };
}

export type SupportsUi = ReturnType<typeof useSupportsUi>;
