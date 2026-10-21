import { canRepair, describeHealth } from './modelCheck.ts';
import { PanelSection } from './PanelSection.tsx';
import type { useModelCheck } from './useModelCheck.ts';

/**
 * The Model check section of the side panel, for a selected imported model: whether its surface is closed (it must be to be cut, grouped with a hole
 * or merged), what is wrong if not, and a Repair button for what can be mended.
 */
export function ModelCheckPanel({ check }: { check: ReturnType<typeof useModelCheck> }) {
	const { model, health, busy, note, error, repair } = check;
	if (!model || !health) return null;
	return (
		<PanelSection title="Model check">
			<ul className="model-check-lines">
				{describeHealth(health).map((line) => (
					<li key={line} className={health.closed ? 'model-ok' : 'model-problem'}>
						{line}
					</li>
				))}
			</ul>
			{canRepair(health) && (
				<button type="button" className="resin-wide" disabled={busy} onClick={() => void repair()}>
					{busy ? 'Repairing…' : 'Repair'}
				</button>
			)}
			{note && (
				<p className="muted hint" aria-live="polite">
					{note}
				</p>
			)}
			{error && (
				<p className="export-problem" role="alert">
					{error}
				</p>
			)}
			{!health.closed && !canRepair(health) && (
				<p className="muted hint">Holecraft cannot mend this by itself: fix it in the program that made it.</p>
			)}
		</PanelSection>
	);
}
