import type { LibrarySummary } from '@holecraft/core';
import { type DragEvent, useRef, useState } from 'react';
import { LIBRARY_DRAG_TYPE } from './shapeDrag.ts';
import { armsOnClick } from './viewport/placement.ts';

/** The saved shapes whose names have every word of the search in them (all of them for no search), in the order given. */
export function matchingSaved(items: readonly LibrarySummary[], query: string): LibrarySummary[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	return items.filter((item) => words.every((w) => item.name.toLowerCase().includes(w)));
}

interface Props {
	items: readonly LibrarySummary[];
	query: string;
	/** The saved shape armed to be put down with the next click on the plate, if any. */
	placingId: string | null;
	onAdd: (id: string) => void;
	/** A mouse click on a tile arms (or, if armed already, lets go of) the saved shape. */
	onArm: (item: LibrarySummary) => void;
	onRename: (id: string, name: string) => void;
	onDelete: (id: string) => void;
}

/**
 * The Mine view of the Shapes panel: the saved shapes as tiles, which add like any shape (click, Enter or drag). With Manage on, each tile
 * gets a rename and a delete, which asks a second time before it goes (there is no hover on a touch screen to tuck them away in).
 */
export function SavedShapes({ items, query, placingId, onAdd, onArm, onRename, onDelete }: Props) {
	const [manage, setManage] = useState(false);
	const shown = matchingSaved(items, query);
	return (
		<>
			<label className="shape-manage">
				<input type="checkbox" checked={manage} onChange={(e) => setManage(e.target.checked)} /> Manage
			</label>
			{items.length === 0 && (
				<p className="muted" role="status">
					Nothing saved yet. Select a shape or group and use Save to library in Properties.
				</p>
			)}
			{items.length > 0 && shown.length === 0 && (
				<p className="muted" role="status">
					No saved shape matches “{query.trim()}”
				</p>
			)}
			<div className="shape-grid">
				{shown.map((item) =>
					manage ? (
						<ManagedTile key={item.id} item={item} onRename={onRename} onDelete={onDelete} />
					) : (
						<SavedTile key={item.id} item={item} armed={item.id === placingId} onAdd={onAdd} onArm={onArm} />
					),
				)}
			</div>
		</>
	);
}

const swatch = (item: LibrarySummary) => <span className="swatch saved" style={{ backgroundColor: item.color }} aria-hidden="true" />;

function SavedTile({
	item,
	armed,
	onAdd,
	onArm,
}: {
	item: LibrarySummary;
	armed: boolean;
	onAdd: (id: string) => void;
	onArm: (item: LibrarySummary) => void;
}) {
	// what pressed the tile, which its click cannot tell: only a mouse or a pen arms the shape (a tap or Enter adds it at once)
	const pointer = useRef('');
	const onDragStart = (e: DragEvent) => {
		e.dataTransfer.setData(LIBRARY_DRAG_TYPE, item.id);
		e.dataTransfer.effectAllowed = 'copy';
	};
	return (
		<div
			role="button"
			tabIndex={0}
			draggable
			aria-pressed={armed}
			className={armed ? 'shape-tile armed' : 'shape-tile'}
			onPointerDown={(e) => {
				pointer.current = e.pointerType;
			}}
			onClick={() => {
				const by = pointer.current;
				pointer.current = '';
				if (armsOnClick(by)) onArm(item);
				else onAdd(item.id);
			}}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onAdd(item.id);
				}
			}}
			onDragStart={onDragStart}
		>
			{swatch(item)}
			{item.name}
		</div>
	);
}

function ManagedTile({ item, onRename, onDelete }: { item: LibrarySummary; onRename: Props['onRename']; onDelete: Props['onDelete'] }) {
	const [renaming, setRenaming] = useState(false);
	const [name, setName] = useState(item.name);
	const [sure, setSure] = useState(false);
	const finish = (save: boolean) => {
		setRenaming(false);
		if (save && name.trim() && name.trim() !== item.name) onRename(item.id, name.trim());
		else setName(item.name);
	};
	return (
		<div className="shape-tile managed">
			{swatch(item)}
			{renaming ? (
				<input
					className="shape-rename"
					aria-label="New name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') finish(true);
						if (e.key === 'Escape') finish(false);
					}}
					onBlur={() => finish(true)}
				/>
			) : (
				<span className="saved-name">{item.name}</span>
			)}
			<span className="saved-actions">
				<button type="button" aria-label={`Rename ${item.name}`} title="Rename" onClick={() => setRenaming(true)}>
					✎
				</button>
				{sure ? (
					<button
						type="button"
						className="really"
						aria-label={`Really delete ${item.name}`}
						onClick={() => onDelete(item.id)}
						onBlur={() => setSure(false)}
					>
						Delete?
					</button>
				) : (
					<button type="button" aria-label={`Delete ${item.name}`} title="Delete" onClick={() => setSure(true)}>
						✕
					</button>
				)}
			</span>
		</div>
	);
}
