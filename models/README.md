# Models written in code

`scripts/model.sh build models/<name>.ts` runs a model file, cuts and joins it with the real geometry engine, and prints
what an export would contain (size, volume, closed surface). Without `--dry` it also saves it as a design on a running
Holecraft and prints the link. Built STLs go to `models/out/`.

A model file exports a default function that takes a `ModelBuilder`, and may export a `name`:

```ts
import type { ModelBuilder } from '@holecraft/core';

export const name = 'My part';
export default (m: ModelBuilder) => {
	const block = m.add({ type: 'box', size: [60, 40, 30] });
	const pocket = m.add({ type: 'box', size: [56, 36, 30], at: [0, 0, 2], hole: true });
	m.group([block, pocket], { name: 'My part' });
};
```

Rules the builder enforces (it throws, naming the part, instead of quietly clamping):

- Sizes are millimetres; `at` is `[x, y, z]` for the **base centre** of the shape (z defaults to 0). Z is up.
- `rotate` is degrees about x, y, z and turns the shape about its centre, then `at` places the base centre. A
  cylinder turned `[0, 90, 0]` points along +x from its base.
- A hole only cuts when it is in a group with a solid (`m.group([...])`); loose holes are reported as warnings.
- `params` takes a shape's own settings in mm (`wall` for a tube, `sides` for a polygon...), plus `chamfer`,
  `chamferEdges`, `countersink`, `countersinkEnd` and `wrap`.

`example-tray.ts` is a worked example (an open box with a port through one wall). Other files here are personal and
ignored by git.
