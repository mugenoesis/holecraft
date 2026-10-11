import type { HandleId, ShapeGeometry } from '@holecraft/core';

const fmt = (n: number) => String(Number(n.toFixed(2)));

/** Text shown while a handle is being dragged: the size, or the height above the workplane. */
export function describeDrag(id: HandleId, g: ShapeGeometry): string {
	return id === 'lift' ? `Z ${fmt(g.z)} mm` : `${fmt(g.width)} × ${fmt(g.depth)} × ${fmt(g.height)} mm`;
}

const signed = (c: string, axis: 'X' | 'Y') => `${c === 'p' ? '+' : '-'}${axis}`;

/** Accessible name for a handle. */
export function handleAriaLabel(id: HandleId): string {
	if (id === 'height') return 'Resize height';
	if (id === 'lift') return 'Lift above workplane';
	if (id.startsWith('corner-')) return `Resize corner ${signed(id[7]!, 'X')} ${signed(id[8]!, 'Y')}`;
	return `Resize side ${signed(id[5]!, id[6] === 'x' ? 'X' : 'Y')}`;
}
