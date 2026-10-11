import type { Design, NodeId } from './design.ts';

/** The most colours (filaments) a design's palette can hold: what a Bambu printer can address. */
export const MAX_PALETTE_SIZE = 16;

/** A new design starts with four colours, the usual multi-material setup, matching the shapes' own default colours. */
export const DEFAULT_PALETTE: readonly string[] = Object.freeze(['#f28c28', '#2a9d8f', '#e76f51', '#8d99ae']);

/** Distinct, printable-looking colours to offer when a colour is added without choosing one. */
const SUGGESTIONS = ['#e63946', '#457b9d', '#f1c40f', '#6a4c93', '#2ecc71', '#ffffff', '#222222', '#ff8fab', '#8ecae6', '#a0522d', '#00b4d8', '#b5e48c'];

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value);

const stamp = (now?: Date) => (now ?? new Date()).toISOString();

/** Adds a colour as the next filament. Ignores bad colours, ones already there, and anything past the limit. */
export function addPaletteColor(design: Design, color: string, now?: Date): Design {
  if (!isHexColor(color) || design.palette.length >= MAX_PALETTE_SIZE) return design;
  const next = color.toLowerCase();
  if (design.palette.includes(next)) return design;
  return { ...design, palette: [...design.palette, next], updatedAt: stamp(now) };
}

/**
 * Changes what a slot is. Every shape and group that was using the slot's old colour changes with it,
 * so a slot keeps meaning "this filament". Refuses a colour another slot already has.
 */
export function setPaletteColor(design: Design, slot: number, color: string, now?: Date): Design {
  const old = design.palette[slot];
  if (old === undefined || !isHexColor(color)) return design;
  const next = color.toLowerCase();
  if (next === old || design.palette.includes(next)) return design;

  const nodes: Design['nodes'] = {};
  for (const [id, node] of Object.entries(design.nodes) as [NodeId, Design['nodes'][NodeId]][]) {
    nodes[id] = node.color === old ? { ...node, color: next } : node;
  }
  const palette = design.palette.map((c, i) => (i === slot ? next : c));
  return { ...design, palette, nodes, updatedAt: stamp(now) };
}

/**
 * Removes a slot; later ones move up. Shapes keep their colours (they print as the nearest remaining
 * filament). The last colour cannot be removed.
 */
export function removePaletteColor(design: Design, slot: number, now?: Date): Design {
  if (design.palette.length <= 1 || design.palette[slot] === undefined) return design;
  return { ...design, palette: design.palette.filter((_, i) => i !== slot), updatedAt: stamp(now) };
}

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/**
 * Which filament a colour prints with: the slot with exactly that colour, or else the nearest one.
 * Numbered from 1, like filaments. A colour that cannot be read, or an empty palette, gives 1.
 */
export function paletteSlotOf(palette: readonly string[], color: string): number {
  if (!isHexColor(color)) return 1;
  const target = rgb(color);
  let best = 0;
  let bestDistance = Infinity;
  palette.forEach((candidate, index) => {
    if (!isHexColor(candidate)) return;
    const c = rgb(candidate);
    const distance = (c[0] - target[0]) ** 2 + (c[1] - target[1]) ** 2 + (c[2] - target[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best + 1;
}

/** A colour that is not in the palette yet, for "add a colour": a pleasant one if any is left, else a made-up one. */
export function suggestPaletteColor(palette: readonly string[]): string {
  const taken = new Set(palette.map((c) => c.toLowerCase()));
  const spare = SUGGESTIONS.find((c) => !taken.has(c));
  if (spare) return spare;
  for (let i = 1; i < 4096; i++) {
    const made = `#${((i * 2654435) % 0xffffff).toString(16).padStart(6, '0')}`;
    if (!taken.has(made)) return made;
  }
  return '#808080';
}
