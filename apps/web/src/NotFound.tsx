import { type ReactNode, useEffect } from 'react';
import { Link } from './Link.tsx';

/** A plain full-page message with a way back to the list of designs. */
export function NotFound({ heading, children }: { heading: string; children?: ReactNode }) {
	useEffect(() => {
		document.title = 'Holecraft';
	}, []);
	return (
		<main className="screen-message">
			<img src="/icon-192.png" alt="" width={56} height={56} />
			<h1>{heading}</h1>
			{children && <p className="muted">{children}</p>}
			<Link to="/">All designs</Link>
		</main>
	);
}
