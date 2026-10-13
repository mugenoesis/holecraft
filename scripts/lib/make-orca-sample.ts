// Writes OrcaSlicer-flavoured 3MFs of three differently coloured shapes with the real export code: one
// with the default four-colour palette, one with a full sixteen (plus plain 3MF and STL files, which the
// engine is known to load, for comparison). Used by scripts/verify-orca-export.sh and
// scripts/update-orca-filament-defaults.sh, which have OrcaSlicer's engine read them.

import { writeFileSync } from 'node:fs';
import { addPaint, addPaletteColor, addShape, createEmptyDesign, type Design, setNodeColor } from '@holecraft/core';
import { collectBodies, loadManifold, write3mf, writeStl } from '@holecraft/geometry';

let d: Design = createEmptyDesign('d', 'Colours');
d = addShape(d, 'box', [0, 0], { id: 'box' }).design; // default orange: filament 1
d = addShape(d, 'cylinder', [40, 0], { id: 'cyl' }).design; // default teal: filament 2
d = addShape(d, 'sphere', [80, 0], { id: 'sph' }).design;
d = setNodeColor(d, ['sph'], '#8d99ae'); // the fourth palette colour: filament 4

let sixteen = d;
for (let i = 0; sixteen.palette.length < 16; i++) sixteen = addPaletteColor(sixteen, `#${(i * 13 + 20).toString(16).padStart(2, '0')}60a0`);

const manifold = await loadManifold();
const bodies = collectBodies(manifold, d);
const out = process.argv[2]!;
writeFileSync(`${out}/orca.3mf`, write3mf(bodies, { filaments: d.palette }));
writeFileSync(`${out}/orca16.3mf`, write3mf(bodies, { filaments: sixteen.palette }));
// the box with its top face painted in the second filament (two triangles), for scripts/verify-orca-export.sh's paint check
const paintedBox = addPaint(addShape(createEmptyDesign('p', 'Paint'), 'box', [0, 0], { id: 'box' }).design, 'box', {
	id: 'top',
	kind: 'region',
	color: '#2a9d8f',
	point: [0, 0, 20],
	normal: [0, 0, 1],
});
writeFileSync(`${out}/paint.3mf`, write3mf(collectBodies(manifold, paintedBox), { filaments: paintedBox.palette }));
// the same box with a round brush dab on its top (the surface is cut finer under it), for the brush check; the number of painted
// triangles is written beside it so the check can require the engine to keep every one
const brushed = addPaint(addShape(createEmptyDesign('b', 'Brush'), 'box', [0, 0], { id: 'box' }).design, 'box', {
	id: 'dab',
	kind: 'brush',
	color: '#2a9d8f',
	shape: 'circle',
	radius: 4,
	dabs: [{ point: [0, 0, 20], normal: [0, 0, 1] }],
});
const brushBodies = collectBodies(manifold, brushed);
writeFileSync(`${out}/brush.3mf`, write3mf(brushBodies, { filaments: brushed.palette }));
writeFileSync(`${out}/brush.count`, String(brushBodies[0]!.mesh.paint!.triangle.filter((v) => v !== 0).length));
writeFileSync(`${out}/plain.3mf`, write3mf(bodies));
writeFileSync(`${out}/plain.stl`, writeStl(bodies));
console.log(`wrote ${bodies.length} bodies; palettes of ${d.palette.length} and ${sixteen.palette.length} colours`);
