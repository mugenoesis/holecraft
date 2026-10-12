import type { Design, NodeId } from './design.ts';

/** Hiding and locking objects: the eye and the padlock in the Objects list. */

const stamp = (now?: Date) => (now ?? new Date()).toISOString();

function setFlag(design: Design, ids: readonly NodeId[], flag: 'hidden' | 'locked', value: boolean, now?: Date): Design {
	const nodes = { ...design.nodes };
	let changed = false;
	for (const id of ids) {
		const node = nodes[id];
		if (!node || node[flag] === value) continue;
		nodes[id] = { ...node, [flag]: value };
		changed = true;
	}
	return changed ? { ...design, nodes, updatedAt: stamp(now) } : design;
}

/** A hidden object is not drawn, picked, selected by Select all, measured, or exported. Hiding a group hides what it holds. */
export function setHidden(design: Design, ids: readonly NodeId[], hidden: boolean, now?: Date): Design {
	return setFlag(design, ids, 'hidden', hidden, now);
}

/** A locked object stays where it is and keeps its look: moves, resizes, turns, recolours and deletes skip it. */
export function setLocked(design: Design, ids: readonly NodeId[], locked: boolean, now?: Date): Design {
	return setFlag(design, ids, 'locked', locked, now);
}

/** Whether anything at all (inside groups too) is hidden. */
export function hasHiddenNodes(design: Design): boolean {
	return Object.values(design.nodes).some((n) => n.hidden);
}

/** Shows every hidden object, including shapes hidden inside groups. */
export function showAll(design: Design, now?: Date): Design {
	return setFlag(design, Object.keys(design.nodes), 'hidden', false, now);
}
