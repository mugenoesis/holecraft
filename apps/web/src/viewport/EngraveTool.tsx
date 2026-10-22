import { type Design, type EngraveSettings, engravePolygons, fromFrame, type NodeId, type OrbitState, toFrame } from '@holecraft/core';
import { useEffect, useState } from 'react';
import type { EngraveRequest } from '../engraveJob.ts';
import { isTypingTarget } from '../keyboard.ts';
import type { EngraveEditJob } from '../useEngrave.ts';
import type { Projection } from './CameraRig.ts';
import { EngraveBar } from './EngraveBar.tsx';
import { EngraveOverlay } from './EngraveOverlay.tsx';
import { DEFAULT_ENGRAVE, type EngraveStart, engraveEdit, engraveRequest, engraveStart, overhangs } from './engraveTool.ts';
import { usePlaneView } from './usePlaneView.ts';
import { useSurfaceTool } from './useSurfaceTool.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	design: Design;
	/** The camera now: it redraws the overlay when it moves, and is what the view goes back to afterwards. */
	camera: { state: OrbitState; projection: Projection };
	/** Fits the lettering to the shape and puts it in the design: null when that worked, else the problem in words. */
	onEngrave: (request: EngraveRequest, edit?: EngraveEditJob) => Promise<string | null>;
	/** An engraving to edit (the group it is in, and the shape), or none: the tool then starts by picking a face. */
	edit?: { group: NodeId; node: NodeId } | null | undefined;
	onClose: () => void;
}

/** The first step: click a face of a shape to put the lettering on. */
function PickSurface({
	getViewport,
	design,
	onPicked,
	onClose,
}: Pick<Props, 'getViewport' | 'design' | 'onClose'> & { onPicked: (s: EngraveStart) => void }) {
	const [problem, setProblem] = useState<string | null>(null);
	useSurfaceTool(getViewport, {
		onClick: (hit) => {
			const start = engraveStart(design, hit);
			if ('problem' in start) setProblem(start.problem);
			else onPicked(start);
		},
		onEscape: onClose,
	});
	return (
		<div className="ruler-readout" data-testid="engrave-hint" role="status">
			<span>{problem ?? 'Click a face of a shape to put lettering on it'}</span>
		</div>
	);
}

/** What the bar says while the words are placed: how, or that some of them are past the edge of the shape (which Done would refuse). */
const placingHint = (overhang: boolean) =>
	overhang
		? 'Some of the words are past the edge of the shape here: make the letters smaller, or move them onto it'
		: 'Click or drag on the surface to place the words, then press Done';

const num = (text: string, empty = Number.NaN) => (text.trim() === '' ? empty : Number(text));

/** The second step: the view looks straight at the face, and the words are placed on it, sized, turned and given a depth. Done fits them to the surface. */
function PlaceLettering({
	getViewport,
	start,
	camera,
	initial,
	onEngrave,
	onClose,
}: Pick<Props, 'getViewport' | 'camera' | 'onClose'> & {
	start: EngraveStart;
	/** The choices to start with (an engraving being edited has its own); the usual ones when there are none. */
	initial?: EngraveSettings | undefined;
	onEngrave: (request: EngraveRequest) => Promise<string | null>;
}) {
	const [text, setText] = useState(initial?.text ?? DEFAULT_ENGRAVE.text);
	const [font, setFont] = useState(initial?.font ?? DEFAULT_ENGRAVE.font);
	const [em, setEm] = useState(String(initial?.em ?? start.em));
	const [depth, setDepth] = useState(String(initial?.depth ?? DEFAULT_ENGRAVE.depth));
	const [angle, setAngle] = useState(String(initial?.angle ?? 0));
	const [mode, setMode] = useState<EngraveSettings['mode']>(initial?.mode ?? 'engrave');
	const [at, setAt] = useState<[number, number]>(initial?.at ?? [0, 0]);
	const [problem, setProblem] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const { frame } = start;

	usePlaneView(getViewport, frame, start.size, camera);

	// A press puts the words where it is, and a drag carries them along.
	useEffect(() => {
		const viewport = getViewport();
		if (!viewport) return;
		const el = viewport.element;
		let dragging = false;
		const place = (e: PointerEvent) => {
			const world = viewport.pickPlane(e.clientX, e.clientY, frame.origin, frame.normal);
			if (world) setAt(toFrame(frame, world));
		};
		const onDown = (e: PointerEvent) => {
			if (e.button !== 0) return;
			dragging = true;
			place(e);
		};
		const onMove = (e: PointerEvent) => dragging && place(e);
		const onUp = () => {
			dragging = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || isTypingTarget(e.target)) return;
			e.stopImmediatePropagation();
			onClose();
		};
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', onUp);
		window.addEventListener('keydown', onKey, true);
		return () => {
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerup', onUp);
			window.removeEventListener('keydown', onKey, true);
		};
	}, [getViewport, frame, onClose]);

	const settings: EngraveSettings = { text, font, em: num(em), angle: num(angle, 0), at, depth: num(depth), mode };
	const polygons = engravePolygons(settings);
	const viewport = getViewport();
	const toScreen = (p: [number, number]): [number, number] => {
		const s = viewport?.project(fromFrame(frame, p));
		return s ? [s.x, s.y] : [0, 0];
	};

	const finish = async () => {
		const request = engraveRequest(start, settings);
		if ('problem' in request) return setProblem(request.problem);
		setBusy(true);
		setProblem(null);
		const failure = await onEngrave(request);
		if (failure === null) return onClose();
		setProblem(failure);
		setBusy(false);
	};
	const edited =
		<T,>(set: (v: T) => void) =>
		(v: T) => {
			set(v);
			setProblem(null);
		};

	return (
		<>
			<EngraveOverlay polygons={polygons} toScreen={toScreen} />
			<EngraveBar
				text={text}
				font={font}
				em={em}
				depth={depth}
				angle={angle}
				mode={mode}
				hint={problem ?? (busy ? 'Fitting the lettering to the surface…' : placingHint(overhangs(polygons, start.reach)))}
				busy={busy}
				onText={edited(setText)}
				onFont={edited(setFont)}
				onEm={edited(setEm)}
				onDepth={edited(setDepth)}
				onAngle={edited(setAngle)}
				onMode={edited(setMode)}
				onCancel={onClose}
				onFinish={() => void finish()}
			/>
		</>
	);
}

/** Editing an engraving: the view looks at the plane it was placed on, with its own choices, and Done fits it again in place of the old one. */
function EditLettering({
	getViewport,
	design,
	camera,
	onEngrave,
	edit,
	onClose,
}: Pick<Props, 'getViewport' | 'design' | 'camera' | 'onEngrave' | 'onClose'> & { edit: { group: NodeId; node: NodeId } }) {
	// worked out once, as the tool opens: the design does not change while it is open
	const [begin] = useState(() => engraveEdit(design, edit.group, edit.node));
	useEffect(() => {
		if (!('problem' in begin)) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || isTypingTarget(e.target)) return;
			e.stopImmediatePropagation();
			onClose();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [begin, onClose]);
	if ('problem' in begin) {
		return (
			<div className="ruler-readout" data-testid="engrave-hint" role="status">
				<span>{begin.problem}</span>
			</div>
		);
	}
	return (
		<PlaceLettering
			getViewport={getViewport}
			start={begin.start}
			initial={begin.settings}
			camera={camera}
			onEngrave={(request) =>
				onEngrave({ ...request, into: begin.into }, { nodeId: edit.node, record: begin.record, fitDesign: begin.fitDesign })
			}
			onClose={onClose}
		/>
	);
}

/**
 * The Engrave tool: click a face of any shape, then the view looks straight at it (as the Sketch tool does) while the words are typed, placed,
 * sized and given a depth; Done fits them to the surface under them and engraves them (or raises them) in the right orientation.
 */
function EngraveTool({ getViewport, design, camera, onEngrave, edit, onClose }: Props) {
	const [start, setStart] = useState<EngraveStart | null>(null);
	if (edit)
		return <EditLettering getViewport={getViewport} design={design} camera={camera} onEngrave={onEngrave} edit={edit} onClose={onClose} />;
	return start ? (
		<PlaceLettering getViewport={getViewport} start={start} camera={camera} onEngrave={onEngrave} onClose={onClose} />
	) : (
		<PickSurface getViewport={getViewport} design={design} onPicked={setStart} onClose={onClose} />
	);
}

/** The Engrave tool when it is the tool in use, and nothing otherwise (so the view's own code has no branch of its own for it). */
export function EngraveHost({ active, ...props }: Props & { active: boolean }) {
	return active ? <EngraveTool {...props} /> : null;
}
