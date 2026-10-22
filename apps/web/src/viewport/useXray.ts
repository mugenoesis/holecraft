import { type Design, designBounds } from '@holecraft/core';
import { useCallback, useMemo, useState } from 'react';
import { type CutAxis, cutRange, defaultCut, type Xray, xrayFor } from './xray.ts';

/**
 * The editor's X-ray choices: the switch (off at the start of every visit: it is a way of looking, not a setting), see-through, and an
 * optional cut across an axis. `xray` is what the viewport draws; the rest feeds the bar.
 */
export function useXray(design: Design) {
	const [on, setOn] = useState(false);
	const [seeThrough, setSeeThrough] = useState(true);
	const [axis, setAxisState] = useState<CutAxis | null>(null);
	const [at, setAt] = useState(0);
	const bounds = useMemo(() => designBounds(design), [design]);

	const toggle = useCallback(() => setOn((now) => !now), []);
	/** Choosing an axis starts the cut at the far end, where nothing is cut away yet. */
	const setAxis = useCallback(
		(next: CutAxis | null) => {
			setAxisState(next);
			if (next) setAt(defaultCut(bounds, next).at);
		},
		[bounds],
	);
	const xray: Xray = useMemo(() => xrayFor({ on, seeThrough, axis, at }, bounds), [on, seeThrough, axis, at, bounds]);
	return {
		on,
		toggle,
		seeThrough,
		setSeeThrough,
		axis,
		setAxis,
		at: xray.cut?.at ?? at,
		setAt,
		range: cutRange(bounds, axis ?? 'z'),
		xray,
	};
}
