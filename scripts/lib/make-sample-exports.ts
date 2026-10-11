// Writes an STL, OBJ and 3MF of a drilled box and a sphere with the real export writers.
// Used by scripts/verify-exports.sh so a third-party mesh library can check the files.

import { writeFileSync } from 'node:fs';
import { addShape, createEmptyDesign, groupNodes, moveNodes, setNodeMode, setShapeSize } from '@holecraft/core';
import { collectBodies, loadManifold, write3mf, writeObj, writeStl } from '@holecraft/geometry';

let d = createEmptyDesign('d', 'Check');
d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
d = setShapeSize(d, 'h', { width: 10, depth: 10, height: 40 });
d = setNodeMode(d, ['h'], 'hole');
d = groupNodes(d, ['a', 'h'], { id: 'g' }).design;
d = addShape(d, 'sphere', [60, 0], { id: 's' }).design;
d = moveNodes(d, ['s'], [0, 0, 3]);

const bodies = collectBodies(await loadManifold(), d);
const out = process.argv[2]!;
writeFileSync(`${out}/check.stl`, writeStl(bodies));
writeFileSync(`${out}/check.obj`, writeObj(bodies));
writeFileSync(`${out}/check.3mf`, write3mf(bodies));
console.log(`wrote ${bodies.length} bodies`);
