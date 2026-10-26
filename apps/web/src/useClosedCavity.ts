import type { Design, MeshData, NodeId } from '@holecraft/core';
import type { ClosedCavity } from '@holecraft/geometry';
import { useEffect, useState } from 'react';
import { onlySelected } from './exportDesign.ts';
import { createWorkerEvaluator, type WorkerEvaluator } from './geometry/workerEvaluator.ts';

/** How long the shape must be left alone before it is checked, so dragging it does not start a check at every step. */
const SETTLE_MS = 400;

let worker: WorkerEvaluator | null = null;

/** The one selected solid top-level shape or group worth checking, or null. */
export function cavityTarget(design: Design, selection: readonly NodeId[]): NodeId | null {
	const id = selection.length === 1 ? selection[0]! : null;
	const node = id ? design.nodes[id] : undefined;
	return id && node && design.roots.includes(id) && node.mode === 'solid' && !node.hidden ? id : null;
}

/**
 * The closed cavities of the selected shape, largest first (see `findClosedCavities`), worked out in a geometry worker of its own once the shape
 * has stopped changing. Empty while there are none, while it is being worked out, or if it cannot be (a check that fails is not worth a message).
 */
export function useClosedCavity(design: Design, selection: readonly NodeId[], meshes: ReadonlyMap<string, MeshData>): ClosedCavity[] {
	const [cavities, setCavities] = useState<ClosedCavity[]>([]);
	const target = cavityTarget(design, selection);

	useEffect(() => {
		// what was found belongs to the shape as it was: a list that is no longer true must not be filled from
		setCavities([]);
		if (!target) return;
		let current = true;
		const timer = setTimeout(() => {
			worker ??= createWorkerEvaluator();
			worker
				.cavities(onlySelected(design, [target]), target, meshes)
				.then((found) => current && setCavities(found))
				.catch(() => current && setCavities([]));
		}, SETTLE_MS);
		return () => {
			current = false;
			clearTimeout(timer);
		};
	}, [design, target, meshes]);

	return cavities;
}
