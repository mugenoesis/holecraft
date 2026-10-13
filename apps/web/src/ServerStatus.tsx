import { useEffect, useState } from 'react';
import { fetchHealth, type Health } from './api.ts';

type ServerState = { kind: 'checking' } | { kind: 'online'; health: Health } | { kind: 'offline' };

/** A small "is the server there?" indicator for the top bar. */
export function ServerStatus() {
	const [state, setState] = useState<ServerState>({ kind: 'checking' });

	useEffect(() => {
		const ctrl = new AbortController();
		fetchHealth(ctrl.signal).then(
			(health) => setState({ kind: 'online', health }),
			() => !ctrl.signal.aborted && setState({ kind: 'offline' }),
		);
		return () => ctrl.abort();
	}, []);

	const label = state.kind === 'online' ? `Server v${state.health.version}` : state.kind === 'offline' ? 'Server offline' : 'Connecting…';
	return (
		<div className={`server-status ${state.kind}`} role="status" title={label}>
			<span className="dot" aria-hidden="true" />
			<span className="server-label">{label}</span>
		</div>
	);
}
