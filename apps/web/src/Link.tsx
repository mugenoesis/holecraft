import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from './router.ts';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string };

/**
 * A real link (so it can be opened in a new tab, copied, or read out by a screen reader) that moves
 * around the app without reloading the page when it is simply clicked.
 */
export function Link({ to, onClick, ...rest }: Props) {
	const handle = (e: MouseEvent<HTMLAnchorElement>) => {
		onClick?.(e);
		if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		navigate(to);
	};
	return <a href={to} onClick={handle} {...rest} />;
}
