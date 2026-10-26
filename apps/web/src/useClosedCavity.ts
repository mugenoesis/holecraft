import type { Design, MeshData, NodeId } from '@holecraft/core';
import type { ClosedCavity } from '@holecraft/geometry';
import { useEffect, useState } from 'react';
import { onlySelected } from './exportDesign.ts';
import { createWorkerEvaluator, type WorkerEvaluator } from './geometry/workerEvaluator.ts';

/** How long the shape must be left alone before it is checked, so dragging it does not start a check at every step. */
const SETTLE_MS = 400;

let worker: WorkerEvaluator | null = null;

/** The one selected solid top-level shape or group worth checking, or null. */
function cavityTarget(design: Design, selection: readonly NodeId[]): NodeId | null {
	const id = selection.length === 1 ? selection[0]! : null;
	const node = id ? design.nodes[id] : undefined;
	return id && node && design.roots.includes(id) && node.mode === 'solid' && !node.hidden ? id : null;
}

/**
 * The largest closed cavity of the selected shape (see `findClosedCavity`), worked out in a geometry worker of its own once the shape
 * has stopped changing. Null while there is none, while it is being worked out, or if it cannot be (a check that fails is not worth a message).
 */
export function useClosedCavity(design: Design, selection: readonly NodeId[], meshes: ReadonlyMap<string, MeshData>): ClosedCavity | null {
	const [cavity, setCavity] = useState<ClosedCavity | null>(null);
	const target = cavityTarget(design, selection);

	useEffect(() => {
		if (!target) {
			setCavity(null);
			return;
		}
		let current = true;
		const timer = setTimeout(() => {
			worker ??= createWorkerEvaluator();
			worker
				.cavity(onlySelected(design, [target]), target, meshes)
				.then((found) => current && setCavity(found))
				.catch(() => current && setCavity(null));
		}, SETTLE_MS);
		return () => {
			current = false;
			clearTimeout(timer);
		};
	}, [design, target, meshes]);

	return cavity;
}
