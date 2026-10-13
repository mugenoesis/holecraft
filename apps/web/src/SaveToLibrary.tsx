import { useState } from 'react';

interface Props {
	/** What the box starts with: the name of what is being saved. */
	defaultName: string;
	/** Saves it under the name; true when it worked. */
	onSave: (name: string) => Promise<boolean>;
	/** Why the last save failed, if it did. */
	problem: string | null;
}

/** "Save to library" in Properties: a button that opens a small name box (Save / Cancel), then says it is saved. */
export function SaveToLibrary({ defaultName, onSave, problem }: Props) {
	const [name, setName] = useState<string | null>(null);
	const [done, setDone] = useState(false);
	const [failed, setFailed] = useState(false);

	const save = async () => {
		if (name === null || !name.trim()) return;
		const ok = await onSave(name.trim());
		setDone(ok);
		setFailed(!ok);
		if (ok) setName(null);
	};

	if (name === null) {
		return (
			<div className="save-to-library">
				<button
					type="button"
					onClick={() => {
						setName(defaultName);
						setDone(false);
						setFailed(false);
					}}
					title="Keep this shape or group to use again, in this design or any other (under Mine in the Shapes panel)"
				>
					Save to library
				</button>
				{done && (
					<p className="muted hint" role="status">
						Saved. It is under Mine in the Shapes panel.
					</p>
				)}
			</div>
		);
	}
	return (
		<div className="save-to-library">
			<label className="field">
				<span>Save as</span>
				<input
					type="text"
					aria-label="Name in the library"
					value={name}
					// biome-ignore lint/a11y/noAutofocus: it opens because the person asked to save, and they will type the name
					autoFocus
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') void save();
						if (e.key === 'Escape') setName(null);
					}}
				/>
			</label>
			<div className="button-row">
				<button type="button" disabled={!name.trim()} onClick={() => void save()}>
					Save
				</button>
				<button type="button" onClick={() => setName(null)}>
					Cancel
				</button>
			</div>
			{failed && (
				<p className="muted hint" role="alert">
					{problem ?? 'It could not be saved'}
				</p>
			)}
		</div>
	);
}
