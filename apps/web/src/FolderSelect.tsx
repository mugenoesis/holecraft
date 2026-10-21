import { folderKey } from '@holecraft/core';
import { type KeyboardEvent, useRef, useState } from 'react';

// Option values: a folder's is its name after a prefix, so no folder's name can be mistaken for the other two.
const NO_FOLDER = 'none';
const NEW_FOLDER = 'new';
const IN = 'in:';

interface Props {
	/** The design's name, for the labels. */
	name: string;
	/** The folder it is in, if any. */
	folder: string | undefined;
	/** Every folder there is. */
	folders: readonly string[];
	disabled: boolean;
	/** A folder name (new or not), or null to take the design out of its folder. */
	onMove: (folder: string | null) => void;
}

/** Where a design lives: a list of the folders, "No folder", and "New folder…", which asks for the name in a box. */
export function FolderSelect({ name, folder, folders, disabled, onMove }: Props) {
	const [naming, setNaming] = useState(false);
	const current = folder ? IN + (folders.find((f) => folderKey(f) === folderKey(folder)) ?? folder) : NO_FOLDER;
	const finished = useRef(false);

	const commit = (value: string) => {
		if (finished.current) return; // Enter is followed by a blur as the box goes away; only act once
		finished.current = true;
		setNaming(false);
		if (value.trim()) onMove(value.trim());
	};
	const cancel = () => {
		finished.current = true;
		setNaming(false);
	};
	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') commit(e.currentTarget.value);
		else if (e.key === 'Escape') cancel();
	};

	if (naming) {
		return (
			<input
				className="folder-name-box"
				aria-label="New folder name"
				placeholder="New folder name"
				maxLength={120}
				// biome-ignore lint/a11y/noAutofocus: the box only appears because the user chose New folder
				autoFocus
				onKeyDown={onKeyDown}
				onBlur={(e) => commit(e.currentTarget.value)}
			/>
		);
	}

	return (
		<select
			className="folder-select"
			aria-label={`Folder for ${name}`}
			value={current}
			disabled={disabled}
			onChange={(e) => {
				if (e.target.value === NEW_FOLDER) {
					finished.current = false;
					setNaming(true);
				} else onMove(e.target.value === NO_FOLDER ? null : e.target.value.slice(IN.length));
			}}
		>
			<option value={NO_FOLDER}>No folder</option>
			{folders.map((f) => (
				<option key={f} value={IN + f}>
					{f}
				</option>
			))}
			<option value={NEW_FOLDER}>New folder…</option>
		</select>
	);
}
