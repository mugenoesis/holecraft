/**
 * Reads the filled shapes of an SVG file as flat outlines in millimetres (y up), ready to be extruded. It reads the parts of SVG a drawing
 * program writes for a filled shape: path, rect, circle, ellipse, polygon and polyline, inside groups with transforms, with fill, fill-rule
 * and display. It does not read strokes, text, gradients, clipping, masks or `use`: the message says what to do when that leaves nothing.
 *
 * It is plain text handling (no DOM), so it runs in the geometry worker, where there is no DOMParser.
 */

type Point = [number, number];
/** An affine transform [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
type Matrix = readonly [number, number, number, number, number, number];

/** A filled shape: its closed contours, and whether overlapping and nested ones cut holes by even-odd (else non-zero) filling. */
export interface SvgOutline {
	polygons: Point[][];
	evenOdd: boolean;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const multiply = (m: Matrix, n: Matrix): Matrix => [
	m[0] * n[0] + m[2] * n[1],
	m[1] * n[0] + m[3] * n[1],
	m[0] * n[2] + m[2] * n[3],
	m[1] * n[2] + m[3] * n[3],
	m[0] * n[4] + m[2] * n[5] + m[4],
	m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, [x, y]: Point): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// ---- reading the markup ----------------------------------------------------------------------------------------------------------

interface Tag {
	kind: 'open' | 'close' | 'self';
	name: string;
	attrs: Record<string, string>;
}

const TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function tags(text: string): Tag[] {
	const clean = text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
		.replace(/<\?[\s\S]*?\?>/g, '')
		.replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, '');
	const out: Tag[] = [];
	for (const m of clean.matchAll(TAG)) {
		const attrs: Record<string, string> = {};
		for (const a of (m[3] ?? '').matchAll(ATTR)) attrs[a[1]!] = a[2] ?? a[3] ?? a[4] ?? '';
		out.push({ kind: m[1] ? 'close' : m[4] ? 'self' : 'open', name: (m[2] ?? '').replace(/^.*:/, ''), attrs });
	}
	return out;
}

// ---- style and transforms --------------------------------------------------------------------------------------------------------

interface Style {
	fill: string;
	evenOdd: boolean;
	hidden: boolean;
	/** There is a stroke, which is not read. */
	stroked: boolean;
}

const DECLARATION = /\s*([\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g;

function declarations(attrs: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of ['fill', 'fill-rule', 'display', 'visibility', 'stroke']) if (attrs[key] !== undefined) out[key] = attrs[key]!.trim();
	for (const m of (attrs.style ?? '').matchAll(DECLARATION)) out[m[1]!] = m[2]!;
	return out;
}

function styleOf(attrs: Record<string, string>, parent: Style): Style {
	const d = declarations(attrs);
	return {
		fill: d.fill ?? parent.fill,
		evenOdd: d['fill-rule'] === undefined ? parent.evenOdd : d['fill-rule'] === 'evenodd',
		hidden: parent.hidden || d.display === 'none' || d.visibility === 'hidden',
		stroked: d.stroke !== undefined ? d.stroke !== 'none' : parent.stroked,
	};
}

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const numbers = (text: string): number[] => (text.match(NUMBER) ?? []).map(Number);

function transformOf(text: string | undefined): Matrix {
	let m = IDENTITY;
	for (const part of (text ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
		const n = numbers(part[2]!);
		const x = n[0] ?? 0;
		const next: Matrix | null =
			(
				{
					translate: () => [1, 0, 0, 1, x, n[1] ?? 0],
					scale: () => [x, 0, 0, n[1] ?? x, 0, 0],
					rotate: () => {
						const [c, s] = [Math.cos((x * Math.PI) / 180), Math.sin((x * Math.PI) / 180)];
						const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
						return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
					},
					matrix: () => [x, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1, n[4] ?? 0, n[5] ?? 0],
					skewx: () => [1, 0, Math.tan((x * Math.PI) / 180), 1, 0, 0],
					skewy: () => [1, Math.tan((x * Math.PI) / 180), 0, 1, 0, 0],
				} as Record<string, () => Matrix>
			)[part[1]!.toLowerCase()]?.() ?? null;
		if (next) m = multiply(m, next);
	}
	return m;
}

const UNITS_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 1, '': 1 };

/** A length written like "50mm" or "10" in millimetres (pixels and plain numbers count as millimetres), or null for none, a percentage or nonsense. */
function lengthMm(text: string | undefined): number | null {
	const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(text ?? '');
	const factor = m ? UNITS_MM[m[2]!.toLowerCase()] : undefined;
	return m && factor !== undefined ? Number(m[1]) * factor : null;
}

/** Where a drawing's own units land in millimetres, with y turned to point up: from its view box, width and height. */
function baseMatrix(attrs: Record<string, string>): Matrix {
	const box = numbers(attrs.viewBox ?? '');
	if (box.length !== 4 || !(box[2]! > 0) || !(box[3]! > 0)) return [1, 0, 0, -1, 0, 0];
	const [w, h] = [lengthMm(attrs.width), lengthMm(attrs.height)];
	const [sx, sy] = [w === null ? null : w / box[2]!, h === null ? null : h / box[3]!];
	const scale = sx !== null && sy !== null ? Math.min(sx, sy) : (sx ?? sy ?? 1);
	return [scale, 0, 0, -scale, -box[0]! * scale, (box[1]! + box[3]!) * scale];
}

// ---- shapes as paths --------------------------------------------------------------------------------------------------------------

type Segment = { line: Point } | { curve: [Point, Point, Point] };
interface Subpath {
	start: Point;
	segments: Segment[];
}

const KAPPA = 0.5522847498307936;

/** An ellipse arc from one point to another as the cubic curves that approximate it (SVG's endpoint form, with its flags). */
function arcToCurves(from: Point, rx: number, ry: number, rotation: number, large: boolean, sweep: boolean, to: Point): Segment[] {
	if (from[0] === to[0] && from[1] === to[1]) return [];
	if (rx === 0 || ry === 0) return [{ line: to }];
	[rx, ry] = [Math.abs(rx), Math.abs(ry)];
	const phi = (rotation * Math.PI) / 180;
	const [c, s] = [Math.cos(phi), Math.sin(phi)];
	const [dx, dy] = [(from[0] - to[0]) / 2, (from[1] - to[1]) / 2];
	const [x1, y1] = [c * dx + s * dy, -s * dx + c * dy];
	const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
	if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];
	const sign = large === sweep ? -1 : 1;
	const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
	const k = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
	const [cxp, cyp] = [(k * rx * y1) / ry, (-k * ry * x1) / rx];
	const [cx, cy] = [c * cxp - s * cyp + (from[0] + to[0]) / 2, s * cxp + c * cyp + (from[1] + to[1]) / 2];
	const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
	const start = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
	let sweepBy = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
	if (!sweep && sweepBy > 0) sweepBy -= 2 * Math.PI;
	if (sweep && sweepBy < 0) sweepBy += 2 * Math.PI;

	const parts = Math.max(1, Math.ceil(Math.abs(sweepBy) / (Math.PI / 2) - 1e-9));
	const step = sweepBy / parts;
	const t = (4 / 3) * Math.tan(step / 4);
	const at = (a: number): Point => [cx + rx * Math.cos(a) * c - ry * Math.sin(a) * s, cy + rx * Math.cos(a) * s + ry * Math.sin(a) * c];
	const slope = (a: number): Point => [-rx * Math.sin(a) * c - ry * Math.cos(a) * s, -rx * Math.sin(a) * s + ry * Math.cos(a) * c];
	const out: Segment[] = [];
	for (let i = 0; i < parts; i++) {
		const [a0, a1] = [start + i * step, start + (i + 1) * step];
		const [p0, p1, d0, d1] = [at(a0), at(a1), slope(a0), slope(a1)];
		out.push({ curve: [[p0[0] + t * d0[0], p0[1] + t * d0[1]], [p1[0] - t * d1[0], p1[1] - t * d1[1]], i === parts - 1 ? to : p1] });
	}
	return out;
}

const ellipsePath = (cx: number, cy: number, rx: number, ry: number): Subpath => ({
	start: [cx + rx, cy],
	segments: [
		{
			curve: [
				[cx + rx, cy + KAPPA * ry],
				[cx + KAPPA * rx, cy + ry],
				[cx, cy + ry],
			],
		},
		{
			curve: [
				[cx - KAPPA * rx, cy + ry],
				[cx - rx, cy + KAPPA * ry],
				[cx - rx, cy],
			],
		},
		{
			curve: [
				[cx - rx, cy - KAPPA * ry],
				[cx - KAPPA * rx, cy - ry],
				[cx, cy - ry],
			],
		},
		{
			curve: [
				[cx + KAPPA * rx, cy - ry],
				[cx + rx, cy - KAPPA * ry],
				[cx + rx, cy],
			],
		},
	],
});

function rectPath(x: number, y: number, w: number, h: number, rx: number, ry: number): Subpath {
	if (!(rx > 0 || ry > 0)) return { start: [x, y], segments: [{ line: [x + w, y] }, { line: [x + w, y + h] }, { line: [x, y + h] }] };
	const [a, b] = [Math.min(rx || ry, w / 2), Math.min(ry || rx, h / 2)];
	const corner = (from: Point, to: Point): Segment[] => arcToCurves(from, a, b, 0, false, true, to);
	return {
		start: [x + a, y],
		segments: [
			{ line: [x + w - a, y] },
			...corner([x + w - a, y], [x + w, y + b]),
			{ line: [x + w, y + h - b] },
			...corner([x + w, y + h - b], [x + w - a, y + h]),
			{ line: [x + a, y + h] },
			...corner([x + a, y + h], [x, y + h - b]),
			{ line: [x, y + b] },
			...corner([x, y + b], [x + a, y]),
		],
	};
}

const pointsPath = (text: string | undefined): Subpath[] => {
	const n = numbers(text ?? '');
	const pts: Point[] = [];
	for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i]!, n[i + 1]!]);
	return pts.length < 3 ? [] : [{ start: pts[0]!, segments: pts.slice(1).map((line) => ({ line })) }];
};

// ---- the path data ----------------------------------------------------------------------------------------------------------------

const ARGUMENTS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** Reads a path's commands, one at a time, keeping where the pen is. */
class PathReader {
	readonly subpaths: Subpath[] = [];
	private current: Subpath | null = null;
	private at: Point = [0, 0];
	/** The control point the next smooth curve reflects. */
	private last: { cubic: Point } | { quad: Point } | null = null;
	private i = 0;
	private relative = false;
	private readonly tokens: RegExpExecArray[];

	constructor(d: string) {
		this.tokens = [...d.matchAll(/([a-zA-Z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g)];
	}

	private fail(): never {
		throw new Error('This SVG has a path that could not be read');
	}

	private number(flag = false): number {
		const t = this.tokens[this.i];
		if (!t || t[2] === undefined) return this.fail();
		if (!flag) {
			this.i++;
			return Number(t[2]);
		}
		// an arc's flags are one digit each, and may have no space after them
		const digit = t[2].replace(/^[-+]/, '')[0];
		if (digit !== '0' && digit !== '1') return this.fail();
		const rest = t[2].replace(/^[-+]/, '').slice(1);
		if (rest) this.tokens[this.i] = [rest, undefined, rest] as unknown as RegExpExecArray;
		else this.i++;
		return Number(digit);
	}

	private point(): Point {
		const base: Point = this.relative ? this.at : [0, 0];
		return [base[0] + this.number(), base[1] + this.number()];
	}

	private begin(p: Point): void {
		this.current = { start: p, segments: [] };
		this.subpaths.push(this.current);
		this.at = p;
	}

	private add(segment: Segment, to: Point): void {
		if (!this.current) this.begin(this.at);
		this.current!.segments.push(segment);
		this.at = to;
	}

	private reflect(point: Point | undefined): Point {
		return point ? [2 * this.at[0] - point[0], 2 * this.at[1] - point[1]] : this.at;
	}

	private line(to: Point): void {
		this.add({ line: to }, to);
		this.last = null;
	}

	private cubic(smooth: boolean): void {
		const c1 = smooth ? this.reflect(this.last && 'cubic' in this.last ? this.last.cubic : undefined) : this.point();
		const [c2, to] = [this.point(), this.point()];
		this.add({ curve: [c1, c2, to] }, to);
		this.last = { cubic: c2 };
	}

	private quadratic(smooth: boolean): void {
		const q = smooth ? this.reflect(this.last && 'quad' in this.last ? this.last.quad : undefined) : this.point();
		const to = this.point();
		const [from, third] = [this.at, 2 / 3];
		// a quadratic as the cubic with the same shape
		const c1: Point = [from[0] + third * (q[0] - from[0]), from[1] + third * (q[1] - from[1])];
		const c2: Point = [to[0] + third * (q[0] - to[0]), to[1] + third * (q[1] - to[1])];
		this.add({ curve: [c1, c2, to] }, to);
		this.last = { quad: q };
	}

	private arc(): void {
		const [rx, ry, rotation] = [this.number(), this.number(), this.number()];
		const [large, sweep] = [this.number(true) === 1, this.number(true) === 1];
		const to = this.point();
		for (const piece of arcToCurves(this.at, rx, ry, rotation, large, sweep, to))
			this.add(piece, 'line' in piece ? piece.line : piece.curve[2]);
		this.at = to;
		this.last = null;
	}

	private straight(horizontal: boolean): void {
		const v = this.number();
		const [x, y] = this.at;
		this.line(horizontal ? [this.relative ? x + v : v, y] : [x, this.relative ? y + v : v]);
	}

	/** The command the next numbers belong to: the letter at the pen, or the one before it when numbers carry on. */
	private commandAt(previous: string): string {
		const t = this.tokens[this.i]!;
		if (t[1]) {
			this.i++;
			if (!(t[1].toLowerCase() in ARGUMENTS)) this.fail();
			return t[1];
		}
		if (!previous || previous.toLowerCase() === 'z') this.fail();
		return previous;
	}

	private close(): void {
		if (this.current) this.at = this.current.start;
		this.current = null;
		this.last = null;
	}

	/** Reads the whole path. Throws on a command it does not know or one missing numbers. */
	read(): Subpath[] {
		let command = '';
		while (this.i < this.tokens.length) {
			command = this.commandAt(command);
			if (command.toLowerCase() === 'z') {
				this.close();
				continue;
			}
			this.relative = command === command.toLowerCase();
			command = this.run(command.toLowerCase(), command);
		}
		return this.subpaths;
	}

	/** Does one command's worth; gives the command to carry on with if more numbers follow (a moveto goes on as lineto). */
	private run(lower: string, command: string): string {
		const handlers: Record<string, () => void> = {
			m: () => {
				this.begin(this.point());
				this.last = null;
			},
			l: () => this.line(this.point()),
			h: () => this.straight(true),
			v: () => this.straight(false),
			c: () => this.cubic(false),
			s: () => this.cubic(true),
			q: () => this.quadratic(false),
			t: () => this.quadratic(true),
			a: () => this.arc(),
		};
		handlers[lower]?.();
		return lower === 'm' ? (command === 'm' ? 'l' : 'L') : command;
	}
}

const pathData = (d: string): Subpath[] => new PathReader(d).read();

// ---- from curves to flat outlines ----------------------------------------------------------------------------------------------

/** Points per millimetre of control polygon along a flattened curve (about half a millimetre a piece). */
const PIECES_PER_MM = 2;
const MIN_PIECES = 4;
const MAX_PIECES = 200;

function flatten(sub: Subpath, m: Matrix): Point[] {
	const out: Point[] = [apply(m, sub.start)];
	for (const segment of sub.segments) {
		const from = out[out.length - 1]!;
		if ('line' in segment) {
			out.push(apply(m, segment.line));
			continue;
		}
		const [c1, c2, to] = segment.curve.map((p) => apply(m, p)) as [Point, Point, Point];
		const length =
			Math.hypot(c1[0] - from[0], c1[1] - from[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(to[0] - c2[0], to[1] - c2[1]);
		const pieces = Math.min(MAX_PIECES, Math.max(MIN_PIECES, Math.ceil(length * PIECES_PER_MM)));
		for (let k = 1; k <= pieces; k++) {
			const t = k / pieces;
			const u = 1 - t;
			out.push([
				u * u * u * from[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * to[0],
				u * u * u * from[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * to[1],
			]);
		}
	}
	// joined end to end, and no point twice in a row: what is left must still be a shape
	const clean = out.filter((p, k) => k === 0 || Math.hypot(p[0] - out[k - 1]![0], p[1] - out[k - 1]![1]) > 1e-9);
	if (clean.length > 1 && Math.hypot(clean[0]![0] - clean[clean.length - 1]![0], clean[0]![1] - clean[clean.length - 1]![1]) < 1e-9)
		clean.pop();
	return clean;
}

// ---- walking the drawing -------------------------------------------------------------------------------------------------------

/** Elements whose insides are not drawn where they stand. */
const NOT_DRAWN = new Set([
	'defs',
	'clipPath',
	'mask',
	'marker',
	'symbol',
	'pattern',
	'metadata',
	'title',
	'desc',
	'style',
	'script',
	'linearGradient',
	'radialGradient',
	'filter',
	'text',
	'foreignObject',
]);

function subpathsOf(tag: Tag): Subpath[] {
	const a = tag.attrs;
	const n = (name: string) => lengthMm(a[name]) ?? 0;
	switch (tag.name) {
		case 'path':
			return pathData(a.d ?? '');
		case 'rect':
			return n('width') > 0 && n('height') > 0 ? [rectPath(n('x'), n('y'), n('width'), n('height'), n('rx'), n('ry'))] : [];
		case 'circle':
			return n('r') > 0 ? [ellipsePath(n('cx'), n('cy'), n('r'), n('r'))] : [];
		case 'ellipse':
			return n('rx') > 0 && n('ry') > 0 ? [ellipsePath(n('cx'), n('cy'), n('rx'), n('ry'))] : [];
		case 'polygon':
		case 'polyline':
			return pointsPath(a.points);
		default:
			return [];
	}
}

const NO_STYLE: Style = { fill: 'black', evenOdd: false, hidden: false, stroked: false };

interface Frame {
	matrix: Matrix;
	style: Style;
}

/** Walks the tags of a drawing, keeping the transform and style of the group it is in, and gathers the filled shapes. */
class Walker {
	readonly outlines: SvgOutline[] = [];
	strokesOnly = false;
	sawText = false;
	private readonly stack: Frame[];
	private skipping = 0;
	private rootSeen = false;

	constructor(root: Tag) {
		this.stack = [{ matrix: baseMatrix(root.attrs), style: NO_STYLE }];
	}

	/** Handles a tag that closes something, or lies inside something skipped; true if there is nothing more to do with it. */
	private passes(tag: Tag): boolean {
		if (tag.kind === 'close') {
			if (this.skipping > 0) this.skipping--;
			else if (this.stack.length > 1) this.stack.pop();
			return true;
		}
		if (this.skipping > 0) {
			if (tag.kind === 'open') this.skipping++;
			return true;
		}
		if (tag.name === 'text') this.sawText = true;
		if (!NOT_DRAWN.has(tag.name)) return false;
		if (tag.kind === 'open') this.skipping = 1;
		return true;
	}

	visit(tag: Tag): void {
		if (this.passes(tag)) return;
		const top = this.stack[this.stack.length - 1]!;
		const style = styleOf(tag.attrs, top.style);
		const isRoot = tag.name === 'svg' && !this.rootSeen;
		this.rootSeen ||= tag.name === 'svg';
		const matrix = isRoot ? top.matrix : multiply(top.matrix, transformOf(tag.attrs.transform));
		if (tag.kind === 'open') this.stack.push({ matrix, style });
		if (!style.hidden) this.fillOf(tag, matrix, style);
	}

	private fillOf(tag: Tag, matrix: Matrix, style: Style): void {
		const subpaths = subpathsOf(tag);
		if (subpaths.length === 0) return;
		if (style.fill === 'none') {
			this.strokesOnly ||= style.stroked;
			return;
		}
		const polygons = subpaths.map((s) => flatten(s, matrix)).filter((p) => p.length >= 3);
		if (polygons.length > 0) this.outlines.push({ polygons, evenOdd: style.evenOdd });
	}
}

/**
 * The filled shapes of an SVG, as outlines in millimetres with y up. Throws an error with a message fit to show when the text is not an SVG or
 * has nothing filled to make a solid from.
 */
export function parseSvg(text: string): SvgOutline[] {
	const all = tags(text);
	const root = all.find((t) => t.name === 'svg' && t.kind !== 'close');
	if (!root) throw new Error('That is not an SVG file');
	const walker = new Walker(root);
	for (const tag of all) walker.visit(tag);
	if (walker.outlines.length === 0) {
		const why = walker.strokesOnly
			? ' It has outlines drawn as strokes: convert the strokes to paths (Inkscape: Path, Stroke to Path) first.'
			: walker.sawText
				? ' It has text: convert the text to paths (Inkscape: Path, Object to Path) first.'
				: '';
		throw new Error(`This SVG has no filled shapes to make a solid from.${why}`);
	}
	return walker.outlines;
}
