import type { Design, MeshData } from '@holecraft/core';
import { useState } from 'react';
import { type BelowPlaneChoice, EXPORT_FORMATS, type ExportFormat } from './exportDesign.ts';
import { defaultTridentAddress, hostLabel, type TridentStatus } from './tridentApi.ts';
import { useTrident } from './useTrident.ts';

/**
 * The Export menu's items: a row for each file format and "Send to Trident", which sends the design to the slicer. The items are the menu
 * proper (a menu may hold nothing but items); what Trident needs besides (the form that says where it is, a message, the settings link) sits next to it.
 */
export function ExportMenuItems({
	source,
	meshes,
	onFormat,
	onSent,
	askBelowPlane,
}: {
	source: Design;
	meshes: ReadonlyMap<string, MeshData>;
	onFormat: (format: ExportFormat) => void;
	onSent: () => void;
	/** Asked when part of what is sent is below the workplane. */
	askBelowPlane: () => Promise<BelowPlaneChoice>;
}) {
	const t = useTrident(source, meshes, onSent, askBelowPlane);
	const configured = t.status?.url ?? null;

	return (
		<>
			<div role="menu" aria-label="Export format">
				{EXPORT_FORMATS.map((f) => (
					<button
						key={f.id}
						type="button"
						role="menuitem"
						aria-label={`${f.label} ${f.hint}, export as ${f.label}`}
						onClick={() => onFormat(f.id)}
					>
						<strong>{f.label}</strong>
						{/* a space between the two, so the words on the button read "STL Best for 3D printing" and the name can start with them (Label in Name) */}{' '}
						<span className="muted">{f.hint}</span>
					</button>
				))}
				<div className="menu-divider" role="separator" />
				<button type="button" role="menuitem" disabled={t.sending || t.status === null} onClick={t.send}>
					<strong>Send to Trident</strong>
					<span className="muted">{t.sending ? 'Sending…' : configured ? hostLabel(configured) : 'Opens it in the slicer'}</span>
				</button>
			</div>
			{t.form ? (
				<TridentForm
					status={t.status}
					setup={t.form === 'setup'}
					error={t.error}
					onSave={t.save}
					onForget={t.forget}
					onCancel={t.closeForm}
				/>
			) : (
				<>
					{t.error && (
						<div className="trident-error" role="alert">
							{t.error}
						</div>
					)}
					{t.openUrl && (
						<div className="trident-note">
							Sent. Your browser would not open a tab:{' '}
							<a href={t.openUrl} target="_blank" rel="noopener noreferrer">
								open it in Trident
							</a>
						</div>
					)}
					{configured && (
						<button type="button" className="menu-link" onClick={t.openSettings}>
							Trident settings…
						</button>
					)}
				</>
			)}
		</>
	);
}

function TridentForm({
	status,
	setup,
	error,
	onSave,
	onForget,
	onCancel,
}: {
	status: TridentStatus | null;
	setup: boolean;
	error: string | null;
	onSave: (url: string, key: string) => void;
	onForget: () => void;
	onCancel: () => void;
}) {
	const [url, setUrl] = useState(status?.url ?? defaultTridentAddress(window.location));
	const [key, setKey] = useState('');
	return (
		<form
			className="trident-form"
			aria-label="Trident settings"
			onSubmit={(e) => {
				e.preventDefault();
				onSave(url.trim(), key.trim());
			}}
		>
			<strong>{setup ? 'Connect to your Trident Studio' : 'Trident settings'}</strong>
			<label>
				Address
				<input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoComplete="off" spellCheck={false} />
			</label>
			<label>
				API key
				<input
					type="password"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					autoComplete="off"
					placeholder={status?.hasKey ? 'Saved: leave empty to keep it' : ''}
				/>
			</label>
			<p className="muted">
				In Trident: settings cog, <em>API keys…</em>, make a <em>Holecraft</em> key. Leave it empty if Trident has no login. Holecraft keeps
				both on this server and never shows the key again.
			</p>
			{error && (
				<div className="trident-error" role="alert">
					{error}
				</div>
			)}
			<div className="trident-actions">
				{!setup && (
					<button type="button" className="trident-forget" onClick={onForget}>
						Forget
					</button>
				)}
				<button type="button" onClick={onCancel}>
					Cancel
				</button>
				<button type="submit" disabled={!url.trim()}>
					{setup ? 'Save and send' : 'Save'}
				</button>
			</div>
		</form>
	);
}
