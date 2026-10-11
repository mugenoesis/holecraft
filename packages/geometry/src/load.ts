import Module, { type ManifoldToplevel } from 'manifold-3d';

/**
 * Loads and initialises manifold-3d. Under Node (tests) it finds its own wasm file. In a browser
 * bundle, pass `locateFile` returning the URL the bundler gave the wasm asset.
 */
export async function loadManifold(locateFile?: () => string): Promise<ManifoldToplevel> {
  const wasm = await (locateFile ? Module({ locateFile }) : Module());
  wasm.setup();
  return wasm;
}
