type ToScreen = (p: [number, number]) => [number, number];

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** The words as they would be placed, drawn flat over the view: one even-odd path through the screen positions of every ring, so a letter's hole is open. */
export function EngraveOverlay({ polygons, toScreen }: { polygons: readonly (readonly [number, number][])[] | null; toScreen: ToScreen }) {
	const path = (polygons ?? [])
		.map((ring) => `${ring.map((p, i) => `${i === 0 ? 'M' : 'L'}${toScreen(p).map(fmt).join(',')}`).join('')}Z`)
		.join('');
	return (
		<svg className="sketch-overlay" data-testid="engrave-overlay" aria-hidden="true">
			{path && <path className="sketch-fill" fillRule="evenodd" d={path} />}
		</svg>
	);
}
