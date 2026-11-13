import type { ModelBuilder } from '@holecraft/core';

export const name = 'Example tray';

// A 60 x 40 x 30 mm open box with 2 mm walls and floor, and a round hole through one wall.
const WALL = 2;
export default (m: ModelBuilder) => {
	const block = m.add({ type: 'box', size: [60, 40, 30], name: 'Block' });
	const pocket = m.add({ type: 'box', size: [60 - 2 * WALL, 40 - 2 * WALL, 30], at: [0, 0, WALL], hole: true, name: 'Pocket' });
	const port = m.add({ type: 'cylinder', size: [8, 8, 10], rotate: [0, 90, 0], at: [-35, 0, 15], hole: true, name: 'Port' });
	m.group([block, pocket, port], { name: 'Tray' });
};
