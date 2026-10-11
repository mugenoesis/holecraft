import type { Design } from '@holecraft/core';
import { meshRefsIn } from '@holecraft/geometry';
import { useEffect, useState } from 'react';
import { fetchMesh } from './meshApi.ts';
import { MeshStore } from './meshStore.ts';

/**
 * The imported models the open design needs, downloaded as they are first seen. `meshes` is a new
 * object each time a model arrives; `add` hands over a model that is already in hand.
 */
export function useMeshes(design: Design): { meshes: MeshStore['table']; add: MeshStore['add'] } {
  const [, rerender] = useState(0);
  const [store] = useState(() => new MeshStore(fetchMesh, () => rerender((n) => n + 1)));

  useEffect(() => {
    store.want(meshRefsIn(design, design.roots));
  }, [store, design]);

  return { meshes: store.table, add: (ref, mesh) => store.add(ref, mesh) };
}
