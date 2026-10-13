import { describe, expect, it } from 'vitest';
import { parseSvg, type SvgOutline } from './svg.ts';

/** Signed area of a polygon (anticlockwise positive), by the shoelace formula. */
const area = (poly: readonly (readonly [number, number])[]) =>
	poly.reduce((sum, [x, y], i) => sum + (x * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * y), 0) / 2;
const total = (outlines: SvgOutline[]) => outlines.flatMap((o) => o.polygons).reduce((sum, p) => sum + area(p), 0);
const bounds = (outlines: SvgOutline[]) => {
	const pts = outlines.flatMap((o) => o.polygons.flat());
	return {
		min: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))],
		max: [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
	};
};
const svg = (body: string, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('parseSvg: shapes', () => {
	it('reads a rectangle, in mm (one user unit is a millimetre), with y turned to point up', () => {
		const out = parseSvg(svg('<rect x="10" y="20" width="30" height="40"/>'));
		expect(out).toHaveLength(1);
		expect(Math.abs(total(out))).toBeCloseTo(1200, 6);
		const b = bounds(out);
		// y was down from the top of the 100 mm view box: 20..60 down is 80..40 up
		expect(b.min).toEqual([10, 40]);
		expect(b.max).toEqual([40, 80]);
	});

	it('reads a circle, an ellipse and a rounded rectangle to within the facet error', () => {
		expect(Math.abs(total(parseSvg(svg('<circle cx="50" cy="50" r="20"/>'))))).toBeCloseTo(Math.PI * 400, -1);
		expect(Math.abs(total(parseSvg(svg('<ellipse cx="50" cy="50" rx="30" ry="10"/>'))))).toBeCloseTo(Math.PI * 300, -1);
		const rounded = Math.abs(total(parseSvg(svg('<rect x="0" y="0" width="40" height="20" rx="5"/>'))));
		expect(rounded).toBeCloseTo(40 * 20 - (4 - Math.PI) * 25, 0);
	});

	it('reads polygons and polylines (closed, as they are filled)', () => {
		expect(Math.abs(total(parseSvg(svg('<polygon points="0,0 10,0 10,10 0,10"/>'))))).toBeCloseTo(100, 6);
		expect(Math.abs(total(parseSvg(svg('<polyline points="0 0, 20 0, 0 10"/>'))))).toBeCloseTo(100, 6);
	});
});

describe('parseSvg: paths', () => {
	it('reads lines, horizontals, verticals and close, absolute and relative', () => {
		expect(Math.abs(total(parseSvg(svg('<path d="M10 10 L30 10 L30 30 L10 30 Z"/>'))))).toBeCloseTo(400, 6);
		expect(Math.abs(total(parseSvg(svg('<path d="M10 10 H30 V30 H10 z"/>'))))).toBeCloseTo(400, 6);
		expect(Math.abs(total(parseSvg(svg('<path d="m10 10 h20 v20 h-20 z"/>'))))).toBeCloseTo(400, 6);
		expect(Math.abs(total(parseSvg(svg('<path d="M0 0 20 0 20 10 0 10"/>'))))).toBeCloseTo(200, 6); // implied lineto, open path closed to fill
	});

	it('reads cubic and quadratic curves, smooth and not: a circle from four cubics is a circle', () => {
		const k = 0.5522847498 * 20;
		const circle = `M70 50 C70 ${50 + k} ${50 + k} 70 50 70 S30 ${50 + k} 30 50 S${50 - k} 30 50 30 S70 ${50 - k} 70 50 Z`;
		expect(Math.abs(total(parseSvg(svg(`<path d="${circle}"/>`))))).toBeCloseTo(Math.PI * 400, -1);
		const quad = Math.abs(total(parseSvg(svg('<path d="M0 0 Q10 20 20 0 T40 0 Z"/>')))); // two arches, 20 wide, 10 high at the middle
		expect(quad).toBeGreaterThan(0);
		expect(quad).toBeLessThan(40 * 10);
	});

	it('reads arcs, including flags written with no spaces: a circle from two arcs', () => {
		const out = parseSvg(svg('<path d="M30 50a20 20 0 1 0 40 0a20 20 0 1 0-40 0z"/>'));
		expect(Math.abs(total(out))).toBeCloseTo(Math.PI * 400, -1);
		const tight = parseSvg(svg('<path d="M30 50a20 20 0 1040 0a20 20 0 10-40 0z"/>'));
		expect(Math.abs(total(tight))).toBeCloseTo(Math.PI * 400, -1);
		const b = bounds(out);
		expect(b.min[0]).toBeCloseTo(30, 1);
		expect(b.max[0]).toBeCloseTo(70, 1);
	});

	it('keeps every subpath of one path (a hole is a second contour), for the fill rule to sort out', () => {
		const out = parseSvg(svg('<path d="M0 0H40V40H0Z M10 10H30V30H10Z"/>'));
		expect(out).toHaveLength(1);
		expect(out[0]!.polygons).toHaveLength(2);
		expect(out[0]!.evenOdd).toBe(false); // nonzero is the default
		expect(parseSvg(svg('<path fill-rule="evenodd" d="M0 0H40V40H0Z M10 10H30V30H10Z"/>'))[0]!.evenOdd).toBe(true);
		expect(parseSvg(svg('<path style="fill-rule:evenodd" d="M0 0H40V40H0Z"/>'))[0]!.evenOdd).toBe(true);
	});

	it('refuses a path it cannot read, saying so, and skips a path with nothing in it', () => {
		expect(() => parseSvg(svg('<path d="M0 0 L10 Q"/><rect width="5" height="5"/>'))).toThrow(/path/i);
		expect(() => parseSvg(svg('<path d="M10 10"/>'))).toThrow(/no filled shapes/i);
	});
});

describe('parseSvg: places, scales and styles', () => {
	it('applies transforms, nested: translate, scale, rotate and matrix, on shapes and on groups', () => {
		const moved = bounds(parseSvg(svg('<g transform="translate(10 20)"><rect width="10" height="10" transform="scale(2)"/></g>')));
		expect(moved.max[0]! - moved.min[0]!).toBeCloseTo(20, 9);
		expect(moved.min[0]).toBeCloseTo(10, 9);
		const turned = bounds(parseSvg(svg('<rect x="40" y="40" width="20" height="10" transform="rotate(90 50 50)"/>')));
		expect(turned.max[0]! - turned.min[0]!).toBeCloseTo(10, 9);
		expect(turned.max[1]! - turned.min[1]!).toBeCloseTo(20, 9);
		const matrix = bounds(parseSvg(svg('<rect width="10" height="10" transform="matrix(2 0 0 3 5 5)"/>')));
		expect([matrix.max[0]! - matrix.min[0]!, matrix.max[1]! - matrix.min[1]!]).toEqual([20, 30]);
	});

	it('takes the size from width and height with units, against the view box: 50 mm wide for a 100 unit view box scales by a half', () => {
		const b = bounds(parseSvg(svg('<rect width="100" height="40"/>', 'width="50mm" height="50mm" viewBox="0 0 100 100"')));
		expect(b.max[0]! - b.min[0]!).toBeCloseTo(50, 9);
		const inches = bounds(parseSvg(svg('<rect width="10" height="10"/>', 'width="1in" height="1in" viewBox="0 0 10 10"')));
		expect(inches.max[0]! - inches.min[0]!).toBeCloseTo(25.4, 9);
		const cm = bounds(parseSvg(svg('<rect width="10" height="10"/>', 'width="2cm" height="2cm" viewBox="0 0 10 10"')));
		expect(cm.max[0]! - cm.min[0]!).toBeCloseTo(20, 9);
	});

	it('takes pixels and unitless numbers as millimetres, and a view box that does not start at 0 as its own origin', () => {
		expect(bounds(parseSvg(svg('<rect width="10" height="10"/>', 'width="10px" height="10px"'))).max[0]).toBe(10);
		const shifted = bounds(parseSvg(svg('<rect x="100" y="100" width="10" height="10"/>', 'viewBox="100 100 50 50"')));
		expect(shifted.min).toEqual([0, 40]);
	});

	it('skips what is not filled or not shown: fill none, display none, hidden, defs and the clip paths in them', () => {
		const body = [
			'<rect width="10" height="10"/>',
			'<rect width="20" height="20" fill="none"/>',
			'<rect width="30" height="30" style="fill:none;stroke:red"/>',
			'<rect width="40" height="40" display="none"/>',
			'<g style="display:none"><rect width="50" height="50"/></g>',
			'<defs><rect width="60" height="60"/></defs>',
			'<clipPath id="c"><rect width="70" height="70"/></clipPath>',
		].join('');
		expect(Math.abs(total(parseSvg(svg(body))))).toBeCloseTo(100, 6);
	});

	it('inherits fill and fill-rule from groups, and a child can say fill none again', () => {
		const out = parseSvg(svg('<g fill="none"><rect width="10" height="10"/><rect width="20" height="20" fill="red"/></g>'));
		expect(Math.abs(total(out))).toBeCloseTo(400, 6);
		expect(parseSvg(svg('<g fill-rule="evenodd"><path d="M0 0H10V10H0Z"/></g>'))[0]!.evenOdd).toBe(true);
	});

	it('skips comments, the xml header, a doctype, metadata and CDATA without being confused by them', () => {
		const text = `<?xml version="1.0"?><!DOCTYPE svg PUBLIC "x" "y"><!-- <rect width="99" height="99"/> --><svg viewBox="0 0 50 50"><metadata><![CDATA[<rect/>]]></metadata><title>t</title><rect width='10' height='10'/></svg>`;
		expect(Math.abs(total(parseSvg(text)))).toBeCloseTo(100, 6);
	});
});

describe('parseSvg: what drawing programs write', () => {
	it('reads an Inkscape file: namespaces, a layer with a transform, styles, and relative curves', () => {
		const text = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297" version="1.1" id="svg8">
  <sodipodi:namedview id="base" pagecolor="#ffffff" inkscape:zoom="0.35"/>
  <defs id="defs2"><linearGradient id="g"><stop offset="0"/></linearGradient></defs>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1" transform="translate(-20,-30)">
    <rect style="fill:#ff0000;fill-opacity:1;stroke:none;stroke-width:0.26" id="rect10" width="40" height="30" x="30" y="40" />
    <path style="fill:#000000;stroke:#000000;stroke-width:1" d="m 60,100 c 0,-10 10,-10 10,0 0,10 -10,10 -10,0 z" id="path12" />
  </g>
</svg>`;
		const out = parseSvg(text);
		expect(out).toHaveLength(2);
		const rect = out.find((o) => o.polygons[0]!.length === 4)!;
		expect(Math.abs(area(rect.polygons[0]!))).toBeCloseTo(1200, 6);
		const b = bounds([rect]);
		expect(b.min[0]).toBeCloseTo(10, 6); // 30 across, less the layer's 20
	});

	it('reads a file with a prefix on every tag (svg:rect), and single-quoted or unquoted values', () => {
		const text = "<svg:svg xmlns:svg='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><svg:rect width=4 height='5'/></svg:svg>";
		expect(Math.abs(total(parseSvg(text)))).toBeCloseTo(20, 6);
	});
});

describe('parseSvg: what it says when it cannot help', () => {
	it('says it is not an SVG, or has no filled shapes (and says why when all it has is strokes or text)', () => {
		expect(() => parseSvg('hello')).toThrow(/not an svg/i);
		expect(() => parseSvg(svg(''))).toThrow(/no filled shapes/i);
		expect(() => parseSvg(svg('<rect width="10" height="10" fill="none" stroke="black"/>'))).toThrow(/stroke/i);
		expect(() => parseSvg(svg('<text x="10" y="10">Hi</text>'))).toThrow(/text/i);
	});
});
