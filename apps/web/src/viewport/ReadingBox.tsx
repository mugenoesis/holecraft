import { mmToUnits, type Units, unitsToMm } from '@holecraft/core';
import { useDraft } from '../useDraft.ts';

interface Props {
	className: string;
	testId: string;
	label: string;
	/** Where its middle is, in view pixels. */
	at: { x: number; y: number };
	mm: number;
	units: Units;
	/** Typing is turned off (the reading is only shown). */
	readOnly?: boolean;
	/** A typed number, already in mm. */
	onType: (mm: number) => void;
}

/** A number floating over the view that can be typed over: committed on Enter or blur, the editor's shortcuts never see the keys. */
export function ReadingBox({ className, testId, label, at, mm, units, readOnly, onType }: Props) {
	const shown = String(Number(mmToUnits(mm, units).toFixed(2)));
	const draft = useDraft(shown, (typed) => {
		const n = Number(typed);
		if (typed.trim() !== '' && Number.isFinite(n)) onType(unitsToMm(n, units));
	});
	return (
		<input
			className={className}
			data-testid={testId}
			aria-label={label}
			inputMode="decimal"
			readOnly={readOnly}
			style={{ left: at.x, top: at.y }}
			value={draft.value}
			onChange={(e) => draft.onChange(e.target.value)}
			onBlur={draft.onBlur}
			onKeyDown={(e) => {
				e.stopPropagation();
				draft.onKeyDown(e);
			}}
			onFocus={(e) => e.currentTarget.select()}
		/>
	);
}
