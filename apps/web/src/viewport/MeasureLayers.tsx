import type { Design, NodeId, ZeroPoint, ZeroTurns } from '@holecraft/core';
import { nextTurn } from '@holecraft/core';
import { SizeLabels } from './SizeLabels.tsx';
import type { Viewport } from './Viewport.ts';
import { ZeroPointOverlay, ZeroPointTool } from './ZeroPointOverlay.tsx';

interface Props {
	getViewport: () => Viewport | null;
	design: Design;
	selection: readonly NodeId[];
	camera: unknown;
	/** True while the Zero point tool is the tool in use. */
	zeroTool: boolean;
	/** True while no tool is in use. */
	noTool: boolean;
	onNudge: (delta: [number, number]) => void;
	onSize: (id: NodeId, group: boolean, size: Partial<Record<'width' | 'depth' | 'height', number>>) => void;
	onZero: (at: ZeroPoint | null, turns: ZeroTurns) => void;
	onCloseTool: () => void;
}

/** What the view says about measurements: the selection's size labels, and the saved zero point with its strips and tool. */
export function MeasureLayers({ getViewport, design, selection, camera, zeroTool, noTool, onNudge, onSize, onZero, onCloseTool }: Props) {
	const zero: ZeroPoint | null = design.zero ? [design.zero.x, design.zero.y] : null;
	const turns: ZeroTurns = design.zero?.turns ?? 0;
	return (
		<>
			{(noTool || zeroTool) && (
				<SizeLabels getViewport={getViewport} design={design} selection={selection} units={design.units} onSize={onSize} camera={camera} />
			)}
			<ZeroPointOverlay
				getViewport={getViewport}
				design={design}
				selection={selection}
				units={design.units}
				zero={zero}
				turns={turns}
				onTurn={() => zero && onZero(zero, nextTurn(turns))}
				onMove={onNudge}
				camera={camera}
			/>
			{zeroTool && (
				<ZeroPointTool
					getViewport={getViewport}
					snap={design.grid.snap}
					zero={zero}
					onZero={(at) => onZero(at, turns)}
					onClear={() => onZero(null, 0)}
					onClose={onCloseTool}
				/>
			)}
		</>
	);
}
