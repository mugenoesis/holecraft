import type { DesignNode, NodeId } from './design.ts';
import { engraveRecordOf } from './engraveRecord.ts';
import { isFontId } from './text.ts';

/** The fonts that text shapes and engravings among these nodes use (each once, by id), which have to be loaded before the nodes are drawn, worked out or edited. */
export function fontsUsedBy(nodes: Readonly<Record<NodeId, DesignNode>>): number[] {
	const used = new Set<number>();
	for (const node of Object.values(nodes)) {
		if (node.kind !== 'shape') continue;
		const font = node.shapeType === 'text' ? Number(node.params.font) : engraveRecordOf(node)?.settings.font;
		if (font !== undefined && isFontId(font)) used.add(font);
	}
	return [...used].sort((a, b) => a - b);
}
