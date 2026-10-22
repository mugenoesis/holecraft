import { Link } from './Link.tsx';

interface Props {
	/** The file that arrived (a zip). */
	title: string;
	/** The models in it, by name. */
	names: readonly string[];
	/** The names that are ticked. */
	selected: readonly string[];
	busy: boolean;
	onToggle: (name: string) => void;
	onAll: () => void;
	onNone: () => void;
	onOpen: () => void;
}

/** Shown when a zip sent by the browser add-on holds several models: tick the ones to open, and they become shapes in a new design. */
export function ChooseModels({ title, names, selected, busy, onToggle, onAll, onNone, onOpen }: Props) {
	const chosen = names.filter((n) => selected.includes(n)).length;
	return (
		<main className="screen-message choose-models">
			<h1 id="choose-title">Which models do you want to open?</h1>
			<p className="muted">
				<strong>{title}</strong> has {names.length} models in it. Each one you tick becomes a shape in a new design.
			</p>
			<ul className="choose-list" aria-labelledby="choose-title">
				{names.map((name) => (
					<li key={name}>
						<label>
							<input type="checkbox" aria-label={name} checked={selected.includes(name)} disabled={busy} onChange={() => onToggle(name)} />
							<span>{name}</span>
						</label>
					</li>
				))}
			</ul>
			<div className="button-row">
				<button type="button" className="primary" disabled={chosen === 0 || busy} onClick={onOpen}>
					{busy ? 'Opening…' : `Open ${chosen} ${chosen === 1 ? 'model' : 'models'}`}
				</button>
				<button type="button" disabled={busy} onClick={onAll}>
					Select all
				</button>
				<button type="button" disabled={busy} onClick={onNone}>
					Select none
				</button>
				<Link to="/">Back to your designs</Link>
			</div>
		</main>
	);
}
