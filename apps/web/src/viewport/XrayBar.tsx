import type { CutAxis } from './xray.ts';

const AXES: ReadonlyArray<{ value: CutAxis; label: string }> = [
	{ value: 'x', label: 'Left to right' },
	{ value: 'y', label: 'Front to back' },
	{ value: 'z', label: 'Up and down' },
];

interface Props {
	seeThrough: boolean;
	/** The axis the cut is across, or null for no cut. */
	axis: CutAxis | null;
	at: number;
	/** How far the cut can slide: the design's extent along the axis (mm). */
	range: readonly [number, number];
	onSeeThrough: (on: boolean) => void;
	onAxis: (axis: CutAxis | null) => void;
	onAt: (at: number) => void;
}

/** The X-ray controls over the view: draw solids see-through, and cut away what is past a plane to look inside. Only a way of looking; the design is not changed. */
export function XrayBar({ seeThrough, axis, at, range, onSeeThrough, onAxis, onAt }: Props) {
	return (
		<div className="xray-bar" role="group" aria-label="X-ray">
			<label>
				<input type="checkbox" checked={seeThrough} onChange={(e) => onSeeThrough(e.target.checked)} /> See through
			</label>
			<label>
				Cut away{' '}
				<select aria-label="Cut across" value={axis ?? ''} onChange={(e) => onAxis((e.target.value || null) as CutAxis | null)}>
					<option value="">Off</option>
					{AXES.map((a) => (
						<option key={a.value} value={a.value}>
							{a.label}
						</option>
					))}
				</select>
			</label>
			{axis && (
				<>
					<input
						type="range"
						aria-label="Cut position"
						min={range[0]}
						max={range[1]}
						step={0.5}
						value={at}
						onChange={(e) => onAt(Number(e.target.value))}
					/>
					<output>{at} mm</output>
				</>
			)}
		</div>
	);
}
