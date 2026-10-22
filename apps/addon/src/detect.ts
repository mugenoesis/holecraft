/*
 * Which responses are model files. The add-on sees the headers of what comes down while a tab on a supported site is open; these rules pick out
 * the ones that are a model (STL, 3MF, OBJ, STEP) or a zip that is being downloaded, and give each a name. Nothing here touches the browser.
 */

/** What the add-on makes of a response: the file's name, whether it is a model or a zip of files, and its size when the server said. */
export interface Candidate {
	name: string;
	kind: 'model' | 'zip';
	size?: number;
}

export interface ResponseInfo {
	url: string;
	status: number;
	contentType?: string | undefined;
	contentDisposition?: string | undefined;
	contentLength?: number | undefined;
}

const MODEL_EXTENSIONS = ['.stl', '.3mf', '.obj', '.step', '.stp'];

/** Models announced by what they are sent as (a name is made up for them). */
const MODEL_TYPES: Record<string, string> = {
	'model/stl': 'model.stl',
	'application/sla': 'model.stl',
	'application/vnd.ms-pki.stl': 'model.stl',
	'model/3mf': 'model.3mf',
	'application/vnd.ms-package.3dmanufacturing-3dmodel+xml': 'model.3mf',
	'model/obj': 'model.obj',
	'model/step': 'model.step',
};

/** What a zip may be sent as when it is named by its address only. */
const ZIP_TYPES = [
	'application/zip',
	'application/x-zip-compressed',
	'application/x-zip',
	'application/octet-stream',
	'binary/octet-stream',
];

/** The name a Content-Disposition header gives: the UTF-8 form (`filename*`) when there is one, else the plain one. Null if there is none or it cannot be read. */
export function filenameFromDisposition(header: string | undefined): string | null {
	if (!header) return null;
	const star = /filename\*\s*=\s*(?:utf-8|UTF-8)'[^']*'([^;]+)/i.exec(header);
	if (star) {
		try {
			return decodeURIComponent(star[1]!.trim());
		} catch {
			return null;
		}
	}
	const plain = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(header);
	const value = plain?.[1] ?? plain?.[2];
	return value === undefined ? null : value.trim();
}

const extensionOf = (name: string): string => {
	const dot = name.lastIndexOf('.');
	return dot < 0 ? '' : name.slice(dot).toLowerCase();
};

/** The last part of a path, whichever way the slashes lean, with control characters gone. */
function cleanName(name: string): string {
	const last = name.split(/[\\/]/).pop() ?? '';
	return [...last]
		.filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
		.join('')
		.trim();
}

function nameFromUrl(url: string): string | null {
	try {
		const last = new URL(url).pathname.split('/').pop() ?? '';
		return last === '' ? null : decodeURIComponent(last);
	} catch {
		return null;
	}
}

/** True for what a page loads for itself: pages, pictures, scripts and data. */
const pageLike = (type: string): boolean =>
	type.startsWith('text/') || type.startsWith('image/') || type.startsWith('font/') || /json|javascript|xml$|css/.test(type);

function describe(name: string, type: string, named: 'header' | 'address', attachment: boolean): Omit<Candidate, 'size'> | null {
	const extension = extensionOf(name);
	if (MODEL_EXTENSIONS.includes(extension)) {
		// a name in the header is the server saying "this is the file"; one from the address needs the response not to be a page
		return named === 'header' || !pageLike(type) ? { name, kind: 'model' } : null;
	}
	if (extension === '.zip') return attachment || ZIP_TYPES.includes(type) ? { name, kind: 'zip' } : null;
	return null;
}

/** What a response is, if it is a model file or a zip being downloaded; null for anything else. */
export function classifyResponse(r: ResponseInfo): Candidate | null {
	if (r.status !== 200) return null;
	const type = (r.contentType ?? '').split(';')[0]!.trim().toLowerCase();
	const attachment = /^\s*attachment/i.test(r.contentDisposition ?? '');
	const fromHeader = filenameFromDisposition(r.contentDisposition);
	const fromAddress = nameFromUrl(r.url);

	let found: Omit<Candidate, 'size'> | null = null;
	if (fromHeader) found = describe(cleanName(fromHeader), type, 'header', attachment || type === '');
	if (!found && fromAddress) found = describe(cleanName(fromAddress), type, 'address', attachment);
	if (!found && MODEL_TYPES[type]) found = { name: MODEL_TYPES[type]!, kind: 'model' };
	if (!found || found.name === '') return null;
	return r.contentLength !== undefined && Number.isFinite(r.contentLength) && r.contentLength >= 0
		? { ...found, size: r.contentLength }
		: found;
}
