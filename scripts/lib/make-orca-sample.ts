// Writes OrcaSlicer-flavoured 3MFs of three differently coloured shapes with the real export code: one
// with the default four-colour palette, one with a full sixteen (plus plain 3MF and STL files, which the
// engine is known to load, for comparison). Used by scripts/verify-orca-export.sh and
// scripts/update-orca-filament-defaults.sh, which have OrcaSlicer's engine read them.

import { writeFileSync } from 'node:fs';
import { addPaletteColor, addShape, createEmptyDesign, type Design, setNodeColor } from '@holecraft/core';
import { collectBodies, loadManifold, write3mf, writeStl } from '@holecraft/geometry';

let d: Design = createEmptyDesign('d', 'Colours');
d = addShape(d, 'box', [0, 0], { id: 'box' }).design; // default orange: filament 1
d = addShape(d, 'cylinder', [40, 0], { id: 'cyl' }).design; // default teal: filament 2
d = addShape(d, 'sphere', [80, 0], { id: 'sph' }).design;
d = setNodeColor(d, ['sph'], '#8d99ae'); // the fourth palette colour: filament 4

let sixteen = d;
for (let i = 0; sixteen.palette.length < 16; i++) sixteen = addPaletteColor(sixteen, `#${(i * 13 + 20).toString(16).padStart(2, '0')}60a0`);

const bodies = collectBodies(await loadManifold(), d);
const out = process.argv[2]!;
writeFileSync(`${out}/orca.3mf`, write3mf(bodies, { filaments: d.palette }));
writeFileSync(`${out}/orca16.3mf`, write3mf(bodies, { filaments: sixteen.palette }));
writeFileSync(`${out}/plain.3mf`, write3mf(bodies));
writeFileSync(`${out}/plain.stl`, writeStl(bodies));
console.log(`wrote ${bodies.length} bodies; palettes of ${d.palette.length} and ${sixteen.palette.length} colours`);
