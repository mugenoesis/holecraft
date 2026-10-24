import { type Design, type NodeId, sizeAnchors, sizeEditTarget, type Units } from '@holecraft/core';
import { ReadingBox } from './ReadingBox.tsx';
import type { Viewport } from './Viewport.ts';
import { selectionBounds } from './ZeroPointOverlay.tsx';

interface Props {
	getViewport: () => Viewport | null;
	design: Design;
	selection: readonly NodeId[];
	units: Units;
	/** Types a size (mm) for the one selected node, as the Properties fields do. */
	onSize: (id: NodeId, group: boolean, size: Partial<Record<'width' | 'depth' | 'height', number>>) => void;
	/** Changes whenever the camera does, so the labels are redrawn where they now are. */
	camera: unknown;
}

/** How far out from the box (view pixels) a label stands: clear of the resize handles, which sit on the box. */
const OUT_PX = 46;

const KEY = { x: 'width', y: 'depth', z: 'height' } as const;
const NAME = { x: 'X size', y: 'Y size', z: 'Z size' } as const;

/**
 * The selection's width, depth and height, each on a thin line out from the middle of its edge of the box and clear of the
 * handles. Typing over one resizes the selection when it is one unturned shape or group; otherwise they only read.
 */
export function SizeLabels({ getViewport, design, selection, units, onSize, camera: _camera }: Props) {
	const viewport = getViewport();
	const bounds = selectionBounds(design, selection);
	if (!viewport || !bounds) return null;
	const target = sizeEditTarget(design, selection);
	const middle = viewport.project([
		(bounds.min[0] + bounds.max[0]) / 2,
		(bounds.min[1] + bounds.max[1]) / 2,
		(bounds.min[2] + bounds.max[2]) / 2,
	]);
	if (!middle) return null;
	const items = sizeAnchors(bounds).flatMap((a) => {
		const p = viewport.project([(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2, (a.from[2] + a.to[2]) / 2]);
		if (!p) return [];
		const dx = p.x - middle.x;
		const dy = p.y - middle.y;
		const len = Math.hypot(dx, dy) || 1;
		return [{ a, p, at: { x: p.x + (dx / len) * OUT_PX, y: p.y + (dy / len) * OUT_PX } }];
	});
	return (
		<>
			<svg className="size-lines" aria-hidden="true" data-testid="size-lines">
				{items.map(({ a, p, at }) => (
					<line key={a.axis} x1={p.x} y1={p.y} x2={at.x} y2={at.y} />
				))}
			</svg>
			<div className="size-labels">
				{items.map(({ a, at }) => (
					<ReadingBox
						key={a.axis}
						className={`size-label size-${a.axis}`}
						testId={`size-${a.axis}`}
						label={`${NAME[a.axis]} (${units})`}
						at={at}
						mm={a.length}
						units={units}
						readOnly={!target}
						onType={(mm) => target && mm > 0 && onSize(target.id, target.group, { [KEY[a.axis]]: mm })}
					/>
				))}
			</div>
		</>
	);
}
