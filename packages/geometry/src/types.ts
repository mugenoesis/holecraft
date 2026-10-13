import type { DesignNode, NodeId, PaintedMesh } from '@holecraft/core';

/** A triangle mesh, ready to hand to the GPU: xyz positions and triangle corner indices. */
export interface GroupMesh {
	positions: Float32Array;
	indices: Uint32Array;
	/** Edge treatments that could not be applied because their edge no longer exists (by id). Absent when all applied. */
	skippedEdges?: string[];
	/** Which triangles are painted, and in what colours (see paintTriangles). Absent when nothing is painted. */
	paint?: PaintedMesh;
}

/** A group and everything inside it: all that is needed to work out its shape. Plain data. */
export interface Subtree {
	rootId: NodeId;
	nodes: Record<NodeId, DesignNode>;
}
