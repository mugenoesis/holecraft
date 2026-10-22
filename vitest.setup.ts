import { FONTS, loadFonts } from '@holecraft/core';

// Fonts load when a design needs them; the tests use text freely, so they start with every font loaded. (textLoading.test.ts checks the loading
// itself, on a fresh copy of the module.)
await loadFonts(FONTS.map((f) => f.id));
