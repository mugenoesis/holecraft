import { type EdgeTreatment, type EdgeTreatmentKind, type MeshEdge, type NodeId, newId, treatEdges } from '@holecraft/core';

/** What the preview tells the editor: it runs like a drag (start, any number of previews, then apply or cancel). */
export interface PreviewHandlers {
	onStart: () => void;
	onPreview: (id: NodeId, edges: EdgeTreatment[]) => void;
	onApply: () => void;
	onCancel: () => void;
}

/**
 * The Edge tool's live preview of one node's treatments. The first choice starts a drag, every change shows the node's
 * treatments as they were before the preview (`base`) plus the chosen edges, Apply ends the drag as one undo step, and
 * anything that drops the choice (Cancel, clearing it, closing the tool) puts the design back as it was.
 */
export class EdgePreview {
	private previewing = false;
	/** The node's treatments before this preview (while previewing, the design shows the preview instead). */
	base: readonly EdgeTreatment[] = [];

	constructor(
		private readonly id: NodeId,
		public handlers: PreviewHandlers,
		private readonly makeId: () => string = newId,
	) {}

	/** Takes the node's current treatments as the base, unless a preview is showing (then the design holds the preview). */
	follow(edges: readonly EdgeTreatment[] | undefined): void {
		if (!this.previewing) this.base = edges ?? [];
	}

	/** Shows the chosen edges treated; with nothing chosen (or no edges yet), ends any preview without a trace. */
	show(found: readonly MeshEdge[] | null, chosen: readonly number[], kind: EdgeTreatmentKind, size: number): void {
		if (!found || chosen.length === 0) {
			this.cancel();
			return;
		}
		if (!this.previewing) this.handlers.onStart();
		this.previewing = true;
		this.handlers.onPreview(this.id, treatEdges(this.base, found, chosen, kind, size, this.makeId));
	}

	/** Keeps what is shown as one undo step, or, given `edges`, keeps those instead (Remove). */
	commit(edges?: EdgeTreatment[]): void {
		if (edges) {
			if (!this.previewing) this.handlers.onStart();
			this.previewing = true;
			this.handlers.onPreview(this.id, edges);
		}
		if (this.previewing) this.handlers.onApply();
		this.previewing = false;
	}

	/** Drops whatever is shown: the design goes back to how it was before the preview. */
	cancel(): void {
		if (this.previewing) this.handlers.onCancel();
		this.previewing = false;
	}
}
