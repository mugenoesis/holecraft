import {
	clearEdges,
	type Design,
	type EdgeTreatment,
	type EdgeTreatmentKind,
	edgeToolTarget,
	type MeshData,
	type MeshEdge,
	type NodeId,
	nearestEdge,
	nextChosen,
	treatedEdges,
} from '@holecraft/core';
import { useEffect, useRef, useState } from 'react';
import { drawEdges, initialEdgeSize, sliderMax, statusText } from './edgeDrawing.ts';
import { EdgePreview, type PreviewHandlers } from './edgePreview.ts';
import { useSurfaceTool } from './useSurfaceTool.ts';
import { type FindEdges, useToolEdges } from './useToolEdges.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	design: Design;
	meshes: ReadonlyMap<string, MeshData>;
	selection: readonly NodeId[];
	findEdges: FindEdges;
	/** The preview runs like a drag: start, preview (any number of times), then apply (one undo step) or cancel. */
	onStart: () => void;
	onPreview: (id: NodeId, edges: EdgeTreatment[]) => void;
	onApply: () => void;
	onCancel: () => void;
	onClose: () => void;
}

/**
 * The Edge tool: chamfer or round chosen edges of the selected solid. Its sharp edges are drawn over the view; click one to
 * choose it (Shift adds more), set Chamfer or Round and the size in the bar, and the result is previewed live. Apply makes it
 * one undo step; Cancel or Escape leaves the design as it was. With nothing usable selected it only says what to select, and
 * the view selects as usual.
 */
export function EdgeTool(props: Props) {
	const target = edgeToolTarget(props.design, props.selection);
	if ('problem' in target) return <EdgeToolHint text={target.problem} onClose={props.onClose} />;
	return <EdgePicker key={target.id} id={target.id} {...props} />;
}

function EdgeToolHint({ text, onClose }: { text: string; onClose: () => void }) {
	const close = useRef(onClose);
	close.current = onClose;
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
	return (
		<div className="ruler-readout" data-testid="edge-tool" role="status">
			<span>{text}</span>
		</div>
	);
}

/** The tool's preview (see EdgePreview), following the design's treatments and kept in step with the choices in the bar. */
function usePreview(
	props: Props & { id: NodeId },
	found: readonly MeshEdge[] | null,
	chosen: readonly number[],
	kind: EdgeTreatmentKind,
	size: number,
): EdgePreview {
	const { id, onStart, onPreview, onApply, onCancel } = props;
	const handlers: PreviewHandlers = { onStart, onPreview, onApply, onCancel };
	const ref = useRef<EdgePreview | null>(null);
	ref.current ??= new EdgePreview(id, handlers);
	const preview = ref.current;
	preview.handlers = handlers;
	preview.follow(props.design.nodes[id]?.edges);

	useEffect(() => preview.show(found, chosen, kind, size), [preview, found, chosen, kind, size]);
	// Closing the tool mid-preview leaves the design as it was.
	useEffect(() => () => preview.cancel(), [preview]);
	return preview;
}

function EdgePicker(props: Props & { id: NodeId }) {
	const { id, design, meshes, findEdges, getViewport } = props;
	const node = design.nodes[id]!;
	const toolEdges = useToolEdges(findEdges, design, id, meshes);
	const found = toolEdges.kind === 'ready' ? toolEdges.edges : null;

	const [chosen, setChosen] = useState<number[]>([]);
	const [hover, setHover] = useState<number | null>(null);
	const [kind, setKind] = useState<EdgeTreatmentKind>('chamfer');
	const [size, setSize] = useState(() => initialEdgeSize(design, id));
	const preview = usePreview(props, found, chosen, kind, size);

	// A different shape (an undo, an edit elsewhere) offers different edges: start choosing afresh.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `found` changing is the trigger
	useEffect(() => setChosen([]), [found]);

	const drawn = found ? drawEdges(getViewport(), node.transform, found) : [];
	const segments = drawn.flatMap((d) => d.segments);
	const segmentsRef = useRef(segments);
	segmentsRef.current = segments;
	const treated = found ? treatedEdges(found, preview.base) : new Set<number>();

	const close = () => {
		preview.cancel();
		props.onClose();
	};
	useSurfaceTool(getViewport, {
		onHoverAt: (at) => setHover(at && nearestEdge(segmentsRef.current, at.x, at.y)),
		onClickAt: ({ x, y }, add) => {
			const edge = nearestEdge(segmentsRef.current, x, y);
			if (edge !== null) setChosen((now) => nextChosen(now, edge, add));
		},
		onEscape: () => (chosen.length ? setChosen([]) : close()),
	});

	const stateOf = (i: number) => (chosen.includes(i) ? 'chosen' : i === hover ? 'hover' : treated.has(i) ? 'treated' : 'plain');
	return (
		<>
			<svg className="edge-lines" aria-hidden="true">
				{drawn.map((d) => (
					<g key={d.index} className={stateOf(d.index)} data-testid="edge-line" data-from={d.from.join(',')} data-to={d.to.join(',')}>
						{d.segments.map((s) => (
							<line key={`${s.a.x},${s.a.y}`} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} />
						))}
					</g>
				))}
			</svg>
			<EdgeBar
				status={statusText(toolEdges, chosen.length)}
				ready={found !== null && found.length > 0}
				chosen={chosen.length}
				anyTreated={chosen.some((i) => treated.has(i))}
				kind={kind}
				size={size}
				maxSize={sliderMax(design, id, size)}
				onKind={setKind}
				onSize={setSize}
				onAll={() => setChosen(found ? found.map((_, i) => i) : [])}
				onClear={() => setChosen([])}
				onRemove={() => {
					preview.commit(found ? clearEdges(preview.base, found, chosen) : undefined);
					setChosen([]);
				}}
				onCancel={() => setChosen([])}
				onApply={() => {
					preview.commit();
					setChosen([]);
				}}
			/>
		</>
	);
}

interface BarProps {
	status: string;
	ready: boolean;
	chosen: number;
	anyTreated: boolean;
	kind: EdgeTreatmentKind;
	size: number;
	maxSize: number;
	onKind: (kind: EdgeTreatmentKind) => void;
	onSize: (size: number) => void;
	onAll: () => void;
	onClear: () => void;
	onRemove: () => void;
	onCancel: () => void;
	onApply: () => void;
}

/** The bar at the bottom of the view: what is chosen, Chamfer or Round, the size, and the actions. */
function EdgeBar(p: BarProps) {
	return (
		<section className="edge-tool" data-testid="edge-tool" aria-label="Edges">
			<p className="edge-tool-status" aria-live="polite">
				{p.status}
			</p>
			{p.ready && (
				<>
					<div className="edge-tool-row">
						<fieldset className="edge-kind" aria-label="Edge shape">
							{(['chamfer', 'round'] as const).map((k) => (
								<label key={k}>
									<input type="radio" name="edge-kind" checked={p.kind === k} onChange={() => p.onKind(k)} />
									{k === 'chamfer' ? 'Chamfer' : 'Round'}
								</label>
							))}
						</fieldset>
						<SizeField size={p.size} max={p.maxSize} onSize={p.onSize} />
					</div>
					<div className="edge-tool-row">
						<button type="button" onClick={p.onAll}>
							All outer edges
						</button>
						<button type="button" onClick={p.onClear} disabled={p.chosen === 0}>
							Clear
						</button>
						{p.anyTreated && (
							<button type="button" onClick={p.onRemove} title="Take the chamfer or round off the chosen edges">
								Remove
							</button>
						)}
						<span className="edge-tool-spacer" />
						<button type="button" onClick={p.onCancel} disabled={p.chosen === 0}>
							Cancel
						</button>
						<button type="button" className="primary" onClick={p.onApply} disabled={p.chosen === 0}>
							Apply
						</button>
					</div>
				</>
			)}
		</section>
	);
}

/** The size in mm: typed (applied as soon as it is a usable number) or dragged on the slider. */
function SizeField({ size, max, onSize }: { size: number; max: number; onSize: (size: number) => void }) {
	const [text, setText] = useState(String(size));
	// Follow the slider (and anything else that sets the size) unless the text already says the same number.
	useEffect(() => setText((now) => (Number(now) === size ? now : String(size))), [size]);
	const typed = (value: string) => {
		setText(value);
		const n = Number(value);
		if (value.trim() !== '' && Number.isFinite(n) && n > 0 && n <= 1000) onSize(n);
	};
	return (
		<span className="edge-size">
			<label>
				Size{' '}
				<input
					type="number"
					aria-label="Size"
					inputMode="decimal"
					min={0.1}
					step={0.1}
					value={text}
					onChange={(e) => typed(e.target.value)}
				/>{' '}
				mm
			</label>
			<input
				type="range"
				aria-label="Size slider"
				min={0.1}
				max={max}
				step={0.1}
				value={Math.min(size, max)}
				onChange={(e) => typed(e.target.value)}
			/>
		</span>
	);
}
