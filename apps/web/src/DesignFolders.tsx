import type { FolderGroup } from '@holecraft/core';
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';

interface Props {
	group: FolderGroup;
	/** Whether the list has any folders at all: only then do the designs in none need a heading of their own. */
	hasFolders: boolean;
	open: boolean;
	onToggle: () => void;
	onRename: (to: string) => Promise<unknown>;
	onRemove: () => Promise<unknown>;
	children: ReactNode;
}

const count = (n: number) => `${n} ${n === 1 ? 'design' : 'designs'}`;

/** One group on the designs list: a folder with its heading (fold, rename, remove) over its designs, or the designs that are in no folder. */
export function DesignGroup({ group, hasFolders, open, onToggle, onRename, onRemove, children }: Props) {
	const folder = group.folder;
	const [mode, setMode] = useState<'view' | 'renaming' | 'confirming'>('view');
	const [busy, setBusy] = useState(false);

	if (folder === null) {
		return (
			<section aria-label="Not in a folder" className="folder-group">
				{hasFolders && <h2 className="folder-title">Not in a folder</h2>}
				{children}
			</section>
		);
	}

	const run = async (action: () => Promise<unknown>) => {
		setBusy(true);
		try {
			await action();
		} finally {
			setBusy(false);
			setMode('view');
		}
	};

	return (
		<section aria-label={`Folder ${folder}`} className="folder-group" data-testid="folder-group">
			<div className="folder-head">
				<button
					type="button"
					className="folder-toggle"
					aria-expanded={open}
					aria-label={`${open ? 'Collapse' : 'Expand'} folder ${folder}`}
					onClick={onToggle}
				>
					<span aria-hidden="true">{open ? '▾' : '▸'}</span>
				</button>
				{mode === 'renaming' ? (
					<FolderNameBox name={folder} onCancel={() => setMode('view')} onCommit={(to) => void run(() => onRename(to))} />
				) : (
					<h2 className="folder-title">{folder}</h2>
				)}
				<span className="muted folder-count">{count(group.designs.length)}</span>
				<span className="spacer" />
				{mode === 'confirming' ? (
					<span className="confirm" role="group" aria-label="Confirm removing the folder">
						<span>Designs stay, in no folder.</span>
						<button type="button" className="danger" disabled={busy} onClick={() => void run(onRemove)}>
							Yes, remove the folder
						</button>
						<button type="button" onClick={() => setMode('view')}>
							Cancel
						</button>
					</span>
				) : (
					<span className="button-row">
						<button type="button" aria-label={`Rename folder ${folder}`} disabled={busy} onClick={() => setMode('renaming')}>
							Rename
						</button>
						<button type="button" aria-label={`Remove folder ${folder}`} disabled={busy} onClick={() => setMode('confirming')}>
							Remove folder
						</button>
					</span>
				)}
			</div>
			{children}
		</section>
	);
}

/** An inline text box for a folder's new name: Enter or clicking away applies, Escape cancels. */
function FolderNameBox({ name, onCommit, onCancel }: { name: string; onCommit: (name: string) => void; onCancel: () => void }) {
	const finished = useRef(false);
	const finish = (value: string) => {
		if (finished.current) return; // Enter is followed by a blur as the box goes away; only act once
		finished.current = true;
		if (value.trim() && value.trim() !== name) onCommit(value.trim());
		else onCancel();
	};
	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') finish(e.currentTarget.value);
		else if (e.key === 'Escape') {
			finished.current = true;
			onCancel();
		}
	};
	return (
		<input
			className="rename-box"
			aria-label="Folder name"
			defaultValue={name}
			maxLength={120}
			// biome-ignore lint/a11y/noAutofocus: the box only appears because the user asked to rename the folder
			autoFocus
			onKeyDown={onKeyDown}
			onBlur={(e) => finish(e.currentTarget.value)}
		/>
	);
}
