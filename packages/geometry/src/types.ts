import type { DesignNode, NodeId } from '@holecraft/core';

/** A triangle mesh, ready to hand to the GPU: xyz positions and triangle corner indices. */
export interface GroupMesh {
	positions: Float32Array;
	indices: Uint32Array;
	/** Edge treatments that could not be applied because their edge no longer exists (by id). Absent when all applied. */
	skippedEdges?: string[];
}

/** A group and everything inside it: all that is needed to work out its shape. Plain data. */
export interface Subtree {
	rootId: NodeId;
	nodes: Record<NodeId, DesignNode>;
}
