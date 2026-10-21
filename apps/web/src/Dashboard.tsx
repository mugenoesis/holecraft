import { type DesignOrder, type DesignSummary, folderNames } from '@holecraft/core';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { DesignGroup } from './DesignFolders.tsx';
import {
	ApiError,
	createDesign,
	deleteDesign,
	duplicateDesign,
	listDesigns,
	moveDesignToFolder,
	removeFolderOnServer,
	renameDesignOnServer,
	renameFolderOnServer,
	thumbnailUrl,
} from './designsApi.ts';
import { FolderSelect } from './FolderSelect.tsx';
import { Link } from './Link.tsx';
import { afterLeaving } from './leaving.ts';
import { designPath, navigate } from './router.ts';
import { ServerStatus } from './ServerStatus.tsx';
import { formatWhen } from './time.ts';
import { useDesignsView } from './useDesignsView.ts';

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; designs: DesignSummary[] };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong');

/** The home screen: every saved design, and a way to make a new one. */
export function Dashboard() {
	const [load, setLoad] = useState<Load>({ kind: 'loading' });
	const [creating, setCreating] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			await afterLeaving(); // a save started by leaving the editor must land before we list
			setLoad({ kind: 'ready', designs: await listDesigns() });
		} catch (error) {
			setLoad({ kind: 'error', message: messageOf(error) });
		}
	}, []);

	useEffect(() => {
		document.title = 'Holecraft';
		void refresh();
	}, [refresh]);

	const startNew = async () => {
		setCreating(true);
		setProblem(null);
		try {
			navigate(designPath((await createDesign()).id));
		} catch (error) {
			setProblem(messageOf(error));
			setCreating(false);
		}
	};

	return (
		<div className="app">
			<header className="topbar">
				<div className="brand">
					<img src="/icon-192.png" alt="" width={24} height={24} />
					<span>Holecraft</span>
				</div>
				<div className="spacer" />
				<ServerStatus />
			</header>

			<main className="dashboard">
				<div className="dashboard-head">
					<h1>Your designs</h1>
					<button type="button" className="primary" onClick={startNew} disabled={creating}>
						New design
					</button>
				</div>

				{problem && (
					<p className="notice error" role="alert">
						{problem}
					</p>
				)}

				{load.kind === 'loading' && <p className="muted">Loading…</p>}

				{load.kind === 'error' && (
					<div className="notice error" role="alert">
						<span>{load.message}</span>
						<button type="button" onClick={() => void refresh()}>
							Retry
						</button>
					</div>
				)}

				{load.kind === 'ready' && load.designs.length === 0 && (
					<div className="empty">
						<p>No designs yet</p>
						<p className="muted">Choose New design to start building something.</p>
					</div>
				)}

				{load.kind === 'ready' && load.designs.length > 0 && (
					<DesignList designs={load.designs} onChanged={refresh} onProblem={setProblem} />
				)}
			</main>
		</div>
	);
}

const ORDER_LABELS: readonly { id: DesignOrder; label: string }[] = [
	{ id: 'updated', label: 'Last changed' },
	{ id: 'name', label: 'Name' },
	{ id: 'created', label: 'Date made' },
];

interface ListProps {
	designs: DesignSummary[];
	onChanged: () => Promise<void>;
	onProblem: (message: string | null) => void;
}

/** The designs in folders, with a search box and a choice of order over them. */
function DesignList({ designs, onChanged, onProblem }: ListProps) {
	const view = useDesignsView(designs);
	const folders = folderNames(designs);
	const hasFolders = folders.length > 0;

	/** Changes something on the server, then reloads the list; says so if the design or folder has gone. */
	const change = async (action: () => Promise<unknown>) => {
		onProblem(null);
		try {
			await action();
		} catch (error) {
			onProblem(error instanceof ApiError && error.status === 404 ? 'That design no longer exists' : messageOf(error));
		}
		await onChanged();
	};

	return (
		<>
			<div className="design-tools">
				<input
					type="search"
					className="design-search"
					aria-label="Search designs"
					placeholder="Search designs and folders"
					value={view.query}
					onChange={(e) => view.setQuery(e.target.value)}
				/>
				<label className="design-sort">
					<span className="muted">Sort by</span>
					<select aria-label="Sort designs by" value={view.order} onChange={(e) => view.setOrder(e.target.value as DesignOrder)}>
						{ORDER_LABELS.map((o) => (
							<option key={o.id} value={o.id}>
								{o.label}
							</option>
						))}
					</select>
				</label>
			</div>

			<div data-testid="design-list">
				{view.groups.length === 0 && <p className="muted">No designs match “{view.query.trim()}”.</p>}
				{view.groups.map((group) => (
					<DesignGroup
						key={group.folder ?? ''}
						group={group}
						hasFolders={hasFolders}
						open={group.folder === null || view.isOpen(group.folder)}
						onToggle={() => group.folder !== null && view.toggleFolder(group.folder)}
						onRename={(to) => change(() => renameFolderOnServer(group.folder ?? '', to))}
						onRemove={() => change(() => removeFolderOnServer(group.folder ?? ''))}
					>
						<ul className="design-grid" aria-label={group.folder ?? 'Designs'} hidden={group.folder !== null && !view.isOpen(group.folder)}>
							{group.designs.map((design) => (
								<DesignCard key={design.id} design={design} folders={folders} onChanged={onChanged} onProblem={onProblem} />
							))}
						</ul>
					</DesignGroup>
				))}
			</div>
		</>
	);
}

interface CardProps {
	design: DesignSummary;
	folders: readonly string[];
	onChanged: () => Promise<void>;
	onProblem: (message: string | null) => void;
}

function DesignCard({ design, folders, onChanged, onProblem }: CardProps) {
	const [mode, setMode] = useState<'view' | 'renaming' | 'confirming'>('view');
	const [busy, setBusy] = useState(false);

	const run = async (action: () => Promise<unknown>) => {
		setBusy(true);
		onProblem(null);
		try {
			await action();
			await onChanged();
		} catch (error) {
			onProblem(error instanceof ApiError && error.status === 404 ? 'That design no longer exists' : messageOf(error));
			await onChanged();
		} finally {
			setBusy(false);
			setMode('view');
		}
	};

	const picture = thumbnailUrl(design);
	const objects = `${design.objectCount} ${design.objectCount === 1 ? 'object' : 'objects'}`;

	return (
		<li className="design-card" data-testid="design-card" data-design-id={design.id}>
			{/* The picture is a second way into the design; the name below is the link for keyboards and screen readers. */}
			<Link to={designPath(design.id)} className="design-thumb" tabIndex={-1} aria-hidden="true">
				{picture ? (
					<img src={picture} alt="" loading="lazy" width={320} height={240} />
				) : (
					<span className="design-thumb-empty">No picture yet</span>
				)}
			</Link>
			{mode === 'renaming' ? (
				<RenameBox
					name={design.name}
					onCancel={() => setMode('view')}
					onCommit={(name) => (name === design.name ? setMode('view') : run(() => renameDesignOnServer(design.id, name)))}
				/>
			) : (
				<Link to={designPath(design.id)} className="design-name-link">
					{design.name}
				</Link>
			)}
			<p className="muted design-meta">
				{objects} · updated {formatWhen(design.updatedAt)}
			</p>
			<FolderSelect
				name={design.name}
				folder={design.folder}
				folders={folders}
				disabled={busy}
				onMove={(folder) => void run(() => moveDesignToFolder(design.id, folder))}
			/>

			{mode === 'confirming' ? (
				<div className="confirm" role="group" aria-label="Confirm delete">
					<span>Delete this design?</span>
					<button type="button" className="danger" disabled={busy} onClick={() => void run(() => deleteDesign(design.id))}>
						Yes, delete
					</button>
					<button type="button" onClick={() => setMode('view')}>
						Cancel
					</button>
				</div>
			) : (
				<div className="button-row">
					<button type="button" aria-label={`Rename ${design.name}`} disabled={busy} onClick={() => setMode('renaming')}>
						Rename
					</button>
					<button
						type="button"
						aria-label={`Duplicate ${design.name}`}
						disabled={busy}
						onClick={() => void run(() => duplicateDesign(design.id))}
					>
						Duplicate
					</button>
					<button type="button" aria-label={`Delete ${design.name}`} disabled={busy} onClick={() => setMode('confirming')}>
						Delete
					</button>
				</div>
			)}
		</li>
	);
}

/** An inline text box for renaming: Enter or clicking away applies, Escape cancels. */
function RenameBox({ name, onCommit, onCancel }: { name: string; onCommit: (name: string) => void; onCancel: () => void }) {
	const finished = useRef(false);
	const finish = (action: () => void) => {
		if (finished.current) return; // Enter is followed by a blur as the box goes away; only act once
		finished.current = true;
		action();
	};
	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') finish(() => (e.currentTarget.value.trim() ? onCommit(e.currentTarget.value.trim()) : onCancel()));
		else if (e.key === 'Escape') finish(onCancel);
	};
	return (
		<input
			className="rename-box"
			aria-label="Design name"
			defaultValue={name}
			maxLength={120}
			// biome-ignore lint/a11y/noAutofocus: the box only appears because the user asked to rename
			autoFocus
			onKeyDown={onKeyDown}
			onBlur={(e) => finish(() => (e.currentTarget.value.trim() ? onCommit(e.currentTarget.value.trim()) : onCancel()))}
		/>
	);
}
