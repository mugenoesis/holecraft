import { type Design, exportObjectCount, type MeshData, supportPointsDocument, supportsStale } from '@holecraft/core';
import { useCallback, useEffect, useState } from 'react';
import { type BelowPlaneChoice, ExportCancelled, exportDeps, exportOrcaBytes } from './exportDesign.ts';
import { forgetTrident, getTrident, modelIdOf, saveTrident, sendToTrident, storeSupportPoints, type TridentStatus } from './tridentApi.ts';

/** Opens the new tab at once, while the click that asked for it is still happening (browsers allow it then, and not after waiting for the network). */
function openTab(): Window | null {
	const tab = window.open('', '_blank');
	if (tab) tab.opener = null;
	return tab;
}

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/**
 * The state of "Send to Trident" in the Export menu: what the server knows (address, whether there is a key), whether the setup form is
 * showing, and sending. `source` is what is exported (the whole design, or the selection); `onSent` runs once the new tab has been given the model.
 */
export function useTrident(
	source: Design,
	meshes: ReadonlyMap<string, MeshData>,
	onSent: () => void,
	askBelowPlane: () => Promise<BelowPlaneChoice>,
) {
	const [status, setStatus] = useState<TridentStatus | null>(null);
	const [form, setForm] = useState<'setup' | 'settings' | null>(null);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	/** Where the model is, when the browser would not let a tab open: shown as a link to click. */
	const [openUrl, setOpenUrl] = useState<string | null>(null);

	useEffect(() => {
		getTrident()
			.then(setStatus)
			.catch(() => setStatus({ url: null, hasKey: false }));
	}, []);

	const deliver = useCallback(
		async (tab: Window | null) => {
			setSending(true);
			setError(null);
			setOpenUrl(null);
			try {
				const file = await exportOrcaBytes(source, exportDeps(meshes, askBelowPlane));
				const sent = await sendToTrident(file);
				// the support points go after the model and before it is opened, so Trident has them when the page asks
				const points = source.supports && !supportsStale(source) ? supportPointsDocument(source, exportObjectCount(source)) : null;
				const modelId = modelIdOf(sent.openUrl);
				if (points && modelId) await storeSupportPoints(modelId, points);
				if (tab) {
					tab.location.href = sent.openUrl;
					onSent();
				} else {
					setOpenUrl(sent.openUrl);
				}
			} catch (e) {
				tab?.close();
				if (!(e instanceof ExportCancelled)) setError(messageOf(e, 'The model could not be sent'));
			} finally {
				setSending(false);
			}
		},
		[source, meshes, onSent, askBelowPlane],
	);

	/** The row was clicked: send now, or ask where Trident is first. */
	const send = useCallback(() => {
		if (!status?.url) {
			setError(null);
			setForm('setup');
			return;
		}
		void deliver(openTab());
	}, [status, deliver]);

	/** The form was submitted: keep the address and key, and send too when it was asked for by trying to send. */
	const save = useCallback(
		async (url: string, key: string) => {
			const tab = form === 'setup' ? openTab() : null;
			setError(null);
			try {
				setStatus(await saveTrident({ url, key }));
				setForm(null);
			} catch (e) {
				tab?.close();
				setError(messageOf(e, 'The settings could not be saved'));
				return;
			}
			if (form === 'setup') await deliver(tab);
		},
		[form, deliver],
	);

	const forget = useCallback(async () => {
		setError(null);
		try {
			setStatus(await forgetTrident());
			setForm(null);
		} catch (e) {
			setError(messageOf(e, 'The settings could not be removed'));
		}
	}, []);

	return {
		status,
		form,
		sending,
		error,
		openUrl,
		send,
		save,
		forget,
		openSettings: () => {
			setError(null);
			setForm('settings');
		},
		closeForm: () => {
			setError(null);
			setForm(null);
		},
	};
}
