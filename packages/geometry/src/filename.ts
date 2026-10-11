const MAX_BASE_LENGTH = 80;
/**
 * Windows device names. They are reserved whatever follows a dot ("con.txt" is the console too), and the
 * superscript digits count as digits. The lookahead stops at a dot or the end, so "console" is fine.
 */
const RESERVED_START = /^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?=\.|$)/i;

/**
 * A file name for an export: the design's name made safe on every common file system (no slashes or
 * other forbidden characters, no control characters, no reserved Windows names), with the extension.
 */
export function exportFileName(designName: string, extension: string): string {
	let base = designName
		.replace(/[\\/:*?"<>|]/g, '-')
		// biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point of this
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/^[\s.]+|[\s.]+$/g, '');

	// Nothing readable left (an empty name, or just punctuation): use a plain name.
	if (!/[\p{L}\p{N}]/u.test(base)) base = 'design';
	base = base.slice(0, MAX_BASE_LENGTH).replace(/[\s.]+$/g, '');
	base = base.replace(RESERVED_START, '$1-design');
	return `${base}.${extension.toLowerCase()}`;
}
