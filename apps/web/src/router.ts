import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'design'; id: string } | { name: 'notfound' };

const ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Which screen an address shows: the list of designs at the root, or one design at
 * /design/<id>. Anything else, including an id that is not shaped like one, is not found.
 */
export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  const [first, id] = parts;
  if (first === 'design' && parts.length === 2 && ID_PATTERN.test(id!)) return { name: 'design', id: id! };
  return { name: 'notfound' };
}

export const designPath = (id: string): string => `/design/${id}`;

const CHANGE_EVENT = 'holecraft:navigate';

/** Moves to another screen without reloading the page. */
export function navigate(path: string): void {
  if (path === window.location.pathname) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The current route, kept up to date as links are followed and the back button is used. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', update);
    window.addEventListener(CHANGE_EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(CHANGE_EVENT, update);
    };
  }, []);
  return route;
}
