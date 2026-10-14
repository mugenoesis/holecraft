import { describe, expect, it } from 'vitest';
import { flipNodes } from './arrange.ts';
import { createEmptyDesign, type Design, type GroupNode } from './design.ts';
import { edgeToolTarget } from './edgeTool.ts';
import { duplicateNodes, moveNodes, setNodeEuler } from './edit.ts';
import { groupFrame, groupStretch, isStretched, nodeFrame } from './groupFrame.ts';
import { canUngroup, groupNodes, ungroupNodes } from './groups.ts';
import {
	bakeStretch,
	canResizeGroup,
	groupGeometry,
	groupResizeMode,
	groupRings,
	holdsFastener,
	setGroupGeometry,
	setGroupSize,
} from './groupTransform.ts';
import { transformPoint } from './mat4.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
import { canPaint } from './paintEdits.ts';
import { parseDesign } from './validate.ts';

const close = (a: readonly number[], b: readonly number[], digits = 6) => {
	expect(a).toHaveLength(b.length);
	for (const [i, v] of a.entries()) expect(v, `component ${i}`).toBeCloseTo(b[i]!, digits);
};

/** Two 20 mm boxes grouped: the group spans x -10..70, y -10..10, z 0..20 (80 x 20 x 20). */
function pair(): { d: Design; g: string } {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [60, 0], { id: 'b' }).design;
	const g = groupNodes(d, ['a', 'b'], { id: 'g' });
	return { d: g.design, g: g.id! };
}

const stretch = (d: Design, id: string, scale: [number, number, number]): Design => ({
	...d,
	nodes: { ...d.nodes, [id]: { ...(d.nodes[id] as GroupNode), scale } },
});

describe('a group’s stretch', () => {
	it('is 1 along every axis when it has none', () => {
		const { d, g } = pair();
		expect(groupStretch(d.nodes[g] as GroupNode)).toEqual([1, 1, 1]);
		expect(isStretched(d.nodes[g] as GroupNode)).toBe(false);
	});

	it('is the group’s own transform when there is no stretch, and leaves other nodes alone', () => {
		const { d, g } = pair();
		expect(groupFrame(d.nodes[g] as GroupNode)).toEqual(d.nodes[g]!.transform);
		expect(nodeFrame(d.nodes.a!)).toEqual(d.nodes.a!.transform);
	});

	it('scales the group’s own axes before its transform places them: world = transform * stretch * point', () => {
		const { d, g } = pair();
		const turned = setNodeEuler(d, g, [0, 0, 90]); // its own x now points along the world y
		const moved = {
			...turned,
			nodes: {
				...turned.nodes,
				[g]: { ...turned.nodes[g]!, transform: turned.nodes[g]!.transform.map((v, i) => (i === 12 ? 5 : i === 13 ? 7 : i === 14 ? 1 : v)) },
			},
		};
		const s = stretch(moved, g, [2, 3, 4]);
		expect(isStretched(s.nodes[g] as GroupNode)).toBe(true);
		const frame = nodeFrame(s.nodes[g]!);
		// the point (10, 20, 30) in the group becomes (20, 60, 120) in its own frame, which the turn sends to (-60, 20, 120) before moving it
		close(transformPoint(frame, [10, 20, 30]), [5 - 60, 7 + 20, 1 + 120]);
	});
});

describe('the bounds of a stretched group', () => {
	it('are the contents’ box stretched along the group’s axes about its origin', () => {
		const { d, g } = pair();
		const b = nodeBoundsIn(stretch(d, g, [2, 1, 3]), g)!;
		close(b.min, [-20, -10, 0]);
		close(b.max, [140, 10, 60]);
	});

	it('follow the group when it is turned, because the stretch is along its own axes', () => {
		const { d, g } = pair();
		const b = nodeBoundsIn(setNodeEuler(stretch(d, g, [2, 1, 1]), g, [0, 0, 90]), g)!;
		close([b.max[0]! - b.min[0]!, b.max[1]! - b.min[1]!, b.max[2]! - b.min[2]!], [20, 160, 20]);
	});
});

describe('saving a stretched group', () => {
	const roundTrip = (d: Design) => parseDesign(JSON.parse(JSON.stringify(d)));

	it('keeps the stretch through a save and load', () => {
		const { d, g } = pair();
		const loaded = roundTrip(stretch(d, g, [2, 1.5, 0.5]));
		expect((loaded.nodes[g] as GroupNode).scale).toEqual([2, 1.5, 0.5]);
	});

	it('leaves the field out when there is no stretch, or it is all 1', () => {
		const { d, g } = pair();
		expect('scale' in (roundTrip(d).nodes[g] as GroupNode)).toBe(false);
		expect('scale' in (roundTrip(stretch(d, g, [1, 1, 1])).nodes[g] as GroupNode)).toBe(false);
	});

	it('refuses a stretch that is not three positive numbers', () => {
		const { d, g } = pair();
		for (const bad of [[1, 1], [1, 1, 0], [1, -1, 1], [1, Number.NaN, 1], [1, 1, 1e9], 'x', null]) {
			const raw = JSON.parse(JSON.stringify(d));
			raw.nodes[g].scale = bad;
			expect(() => parseDesign(raw), JSON.stringify(bad)).toThrow(/scale/);
		}
	});

	it('drops a stretch on anything that is not a group', () => {
		const { d } = pair();
		const raw = JSON.parse(JSON.stringify(d));
		raw.nodes.a.scale = [2, 2, 2];
		expect('scale' in parseDesign(raw).nodes.a!).toBe(false);
	});
});

describe('ungrouping a stretched group', () => {
	it('bakes the stretch into the shapes when they are in quarter turns, so they come out where they were drawn', () => {
		const { d, g } = pair();
		const out = ungroupNodes(stretch(d, g, [2, 1, 3]), [g]);
		expect(out.ids).toEqual(['a', 'b']);
		const a = nodeBoundsIn(out.design, 'a')!;
		const b = nodeBoundsIn(out.design, 'b')!;
		close(a.min, [-20, -10, 0]); // the first box was 20 wide at x -10..10: now 40 wide at x -20..20
		close(a.max, [20, 10, 60]);
		close(b.min, [100, -10, 0]); // the second was at 50..70: now 100..140
		close(b.max, [140, 10, 60]);
	});

	it('leaves a group whose shapes are turned at other angles as it is (it cannot be baked), and says nothing changed', () => {
		const { d, g } = pair();
		const skew = stretch(setNodeEuler(d, 'a', [0, 0, 30]), g, [2, 1, 1]);
		const out = ungroupNodes(skew, [g]);
		expect(out.ids).toEqual([]);
		expect(out.design).toBe(skew);
	});

	it('still ungroups a group with no stretch exactly as before', () => {
		const { d, g } = pair();
		expect(ungroupNodes(setNodeEuler(d, 'a', [0, 0, 30]), [g]).ids).toEqual(['a', 'b']);
	});
});

/** The pair with its first box turned 30 degrees, so the contents cannot be rewritten to a new size without shearing it. */
function odd(): { d: Design; g: string } {
	const { d, g } = pair();
	return { d: setNodeEuler(d, 'a', [0, 0, 30]), g };
}

const extent = (d: Design, id: string) => {
	const b = nodeBoundsIn(d, id)!;
	return { min: b.min, max: b.max, size: [0, 1, 2].map((k) => b.max[k]! - b.min[k]!) };
};

describe('stretching a group whose shapes are turned at odd angles', () => {
	it('can be resized: the box handles get the contents’ size', () => {
		const { d, g } = odd();
		expect(canResizeGroup(d, g)).toBe(true);
		const geo = groupGeometry(d, g)!;
		expect(geo.depth).toBeGreaterThan(20); // the turned box is wider across than 20
	});

	it('gives the group a stretch and leaves every shape inside exactly as it was', () => {
		const { d, g } = odd();
		const geo = groupGeometry(d, g)!;
		const out = setGroupGeometry(d, g, { ...geo, width: geo.width * 2, x: geo.x + geo.width / 2 });
		expect(out).not.toBe(d);
		expect(groupStretch(out.nodes[g] as GroupNode)[0]).toBeCloseTo(2);
		expect(groupStretch(out.nodes[g] as GroupNode)[1]).toBeCloseTo(1);
		expect(out.nodes.a).toEqual(d.nodes.a); // not rewritten: it is still the box that was turned
		expect(out.nodes.b).toEqual(d.nodes.b);
	});

	it('doubles the group along its own axis and keeps the opposite side where it was', () => {
		const { d, g } = odd();
		const before = extent(d, g);
		const geo = groupGeometry(d, g)!;
		const out = extent(setGroupGeometry(d, g, { ...geo, width: geo.width * 2, x: geo.x + geo.width / 2 }), g);
		close([out.size[0]!], [before.size[0]! * 2]);
		close([out.min[0]!], [before.min[0]!]); // dragged the +x side: the -x side stays
		close([out.size[1]!, out.size[2]!], [before.size[1]!, before.size[2]!]);
	});

	it('stretches again from where it is: the sizes asked for are the sizes it gets', () => {
		const { d, g } = odd();
		const once = setGroupGeometry(d, g, { ...groupGeometry(d, g)!, width: 120, depth: 50, height: 5 });
		const geo = groupGeometry(once, g)!;
		close([geo.width, geo.depth, geo.height], [120, 50, 5]);
		const twice = setGroupGeometry(once, g, { ...geo, width: 60 });
		close([groupGeometry(twice, g)!.width], [60]);
		close([groupGeometry(twice, g)!.depth], [50]);
	});

	it('drops the stretch again when it is back to its own size', () => {
		const { d, g } = odd();
		const geo = groupGeometry(d, g)!;
		const bigger = setGroupGeometry(d, g, { ...geo, width: geo.width * 3 });
		const back = setGroupGeometry(bigger, g, geo);
		expect(isStretched(back.nodes[g] as GroupNode)).toBe(false);
		close(nodeBoundsIn(back, g)!.min, nodeBoundsIn(d, g)!.min);
		close(nodeBoundsIn(back, g)!.max, nodeBoundsIn(d, g)!.max);
	});

	it('works along its own axes when the group is also tipped', () => {
		const { d, g } = odd();
		const tipped = setNodeEuler(d, g, [0, 90, 0]); // its own x now points straight down
		const geo = groupGeometry(tipped, g)!;
		const out = setGroupGeometry(tipped, g, { ...geo, width: geo.width * 2 });
		close([extent(out, g).size[2]!], [extent(tipped, g).size[2]! * 2]); // the length runs along the world z
	});

	it('is turned about the middle of what it holds, whatever its stretch', () => {
		const { d, g } = odd();
		const s = setGroupGeometry(d, g, { ...groupGeometry(d, g)!, width: 200 });
		const centre = (x: Design) => extent(x, g).min.map((v, k) => (v + extent(x, g).max[k]!) / 2);
		close(centre(setNodeEuler(s, g, [0, 0, 90])), centre(s));
	});

	it('moves its rings out to the stretched size', () => {
		const { d, g } = odd();
		const s = setGroupGeometry(d, g, { ...groupGeometry(d, g)!, width: 400 });
		expect(groupRings(s, g)!.radius).toBeGreaterThan(groupRings(d, g)!.radius + 100);
	});

	it('takes a typed size', () => {
		const { d, g } = odd();
		const out = setGroupSize(d, g, { height: 7 });
		close([groupGeometry(out, g)!.height], [7]);
	});

	it('refuses sizes outside 0.1 to 1000 mm, a locked group and one that holds a thread', () => {
		const { d, g } = odd();
		const geo = groupGeometry(d, g)!;
		expect(setGroupGeometry(d, g, { ...geo, width: 0.05 })).toBe(d);
		expect(setGroupGeometry(d, g, { ...geo, width: 5000 })).toBe(d);
		const locked = { ...d, nodes: { ...d.nodes, [g]: { ...d.nodes[g]!, locked: true } } };
		expect(setGroupGeometry(locked, g, { ...geo, width: 100 })).toBe(locked);
		let t = addShape(createEmptyDesign('t'), 'threaded-rod', [0, 0], { id: 'r' }).design;
		t = addShape(t, 'box', [60, 0], { id: 'x' }).design;
		const withThread = setNodeEuler(groupNodes(t, ['r', 'x'], { id: 'tg' }).design, 'x', [0, 0, 30]);
		expect(canResizeGroup(withThread, 'tg')).toBe(false);
	});

	it('saves and loads a stretched group, which draws as it did', () => {
		const { d, g } = odd();
		const s = setGroupGeometry(d, g, { ...groupGeometry(d, g)!, width: 150 });
		const loaded = parseDesign(JSON.parse(JSON.stringify(s)));
		close(nodeBoundsIn(loaded, g)!.max, nodeBoundsIn(s, g)!.max);
	});
});

describe('baking a stretch', () => {
	it('is the design itself when there is no stretch, and null when the shapes inside are turned at odd angles', () => {
		const { d, g } = pair();
		expect(bakeStretch(d, g)).toBe(d);
		expect(bakeStretch(stretch(setNodeEuler(d, 'a', [0, 0, 30]), g, [2, 1, 1]), g)).toBeNull();
	});

	it('leaves the group the same size in the world, with no stretch, and resized shapes', () => {
		const { d, g } = pair();
		const s = stretch(d, g, [2, 1, 3]);
		const baked = bakeStretch(s, g)!;
		expect(isStretched(baked.nodes[g] as GroupNode)).toBe(false);
		close(nodeBoundsIn(baked, g)!.max, nodeBoundsIn(s, g)!.max);
		close(nodeBoundsIn(baked, g)!.min, nodeBoundsIn(s, g)!.min);
		expect((baked.nodes.a as unknown as { params: { width: number; height: number } }).params).toMatchObject({ width: 40, height: 60 });
	});
});

describe('other edits on a stretched group', () => {
	const stretchedOdd = () => {
		const { d, g } = odd();
		return { d: setGroupGeometry(d, g, { ...groupGeometry(d, g)!, width: 150 }), g };
	};

	it('flipping mirrors it across the plane and keeps its stretch', () => {
		const { d, g } = stretchedOdd();
		const b0 = extent(d, g);
		const out = flipNodes(d, [g], 'x');
		expect(isStretched(out.nodes[g] as GroupNode)).toBe(true);
		const b1 = extent(out, g);
		close(b1.size, b0.size); // same size, mirrored about its own middle
		close([(b1.min[0]! + b1.max[0]!) / 2], [(b0.min[0]! + b0.max[0]!) / 2]);
	});

	it('a copy has the same stretch', () => {
		const { d, g } = stretchedOdd();
		const out = duplicateNodes(d, [g], [10, 0]);
		const copy = out.design.nodes[out.ids[0]!] as GroupNode;
		expect(copy.scale).toEqual((d.nodes[g] as GroupNode).scale);
	});

	it('moving it keeps its size', () => {
		const { d, g } = stretchedOdd();
		const out = moveNodes(d, [g], [30, 0, 0]);
		close(extent(out, g).size, extent(d, g).size);
		close([extent(out, g).min[0]!], [extent(d, g).min[0]! + 30]);
	});
});

describe('what a stretched group cannot be used for', () => {
	const stretchedOdd = () => {
		const { d, g } = odd();
		return { d: setGroupGeometry(d, g, { ...groupGeometry(d, g)!, width: 150 }), g };
	};

	it('cannot be ungrouped when it holds shapes turned at odd angles (it would distort them), but can when it can be baked', () => {
		const { d, g } = stretchedOdd();
		expect(canUngroup(d, [g])).toBe(false);
		const { d: p, g: pg } = pair();
		expect(canUngroup(stretch(p, pg, [2, 1, 1]), [pg])).toBe(true);
		expect(canUngroup(odd().d, [odd().g])).toBe(true); // not stretched: as before
	});

	it('cannot take new paint, and the Edge tool says why', () => {
		const { d, g } = stretchedOdd();
		expect(canPaint(d, g)).toBe(false);
		expect(canPaint(odd().d, g)).toBe(true);
		const target = edgeToolTarget(d, [g]);
		expect('problem' in target && target.problem).toMatch(/stretched/);
		expect(edgeToolTarget(odd().d, [g])).toEqual({ id: g });
	});
});

describe('a group holding a fastener (a thread, nut, washer or standoff)', () => {
	/** A threaded rod and a box side by side, grouped. */
	function withRod(): { d: Design; g: string } {
		let d = createEmptyDesign('d');
		d = addShape(d, 'threaded-rod', [0, 0], { id: 'rod' }).design;
		d = addShape(d, 'box', [60, 0], { id: 'x' }).design;
		const g = groupNodes(d, ['rod', 'x'], { id: 'g' });
		return { d: g.design, g: g.id! };
	}
	const open = { fasteners: true };

	it('is told apart from one that holds none', () => {
		expect(holdsFastener(withRod().d, 'g')).toBe(true);
		expect(holdsFastener(pair().d, 'g')).toBe(false);
		expect(holdsFastener(withRod().d, 'x')).toBe(false);
	});

	it('is locked by default: no handles, no typed size, nothing changes', () => {
		const { d, g } = withRod();
		expect(canResizeGroup(d, g)).toBe(false);
		expect(groupResizeMode(d, g)).toBeNull();
		const geo = groupGeometry(d, g)!;
		expect(setGroupGeometry(d, g, { ...geo, width: geo.width * 2 })).toBe(d);
		expect(setGroupSize(d, g, { height: 50 })).toBe(d);
	});

	it('can be stretched once unlocked, and always by giving the group a stretch: the thread itself is not rewritten', () => {
		const { d, g } = withRod();
		expect(canResizeGroup(d, g, open)).toBe(true);
		expect(groupResizeMode(d, g, open)).toBe('stretch');
		const geo = groupGeometry(d, g)!;
		const out = setGroupGeometry(d, g, { ...geo, width: geo.width * 2 }, undefined, open);
		expect(out).not.toBe(d);
		expect(groupStretch(out.nodes[g] as GroupNode)[0]).toBeCloseTo(2);
		expect(out.nodes.rod).toEqual(d.nodes.rod); // its width, depth and height are the ones its Size and Fit give
		expect(extent(out, g).size[0]).toBeCloseTo(extent(d, g).size[0]! * 2);
	});

	it('takes a typed size once unlocked', () => {
		const { d, g } = withRod();
		const out = setGroupSize(d, g, { height: 55 }, undefined, open);
		expect(groupGeometry(out, g)!.height).toBeCloseTo(55);
	});

	it('stays stretched when it is locked again, but cannot be changed further', () => {
		const { d, g } = withRod();
		const out = setGroupGeometry(d, g, { ...groupGeometry(d, g)!, width: 120 }, undefined, open);
		expect(canResizeGroup(out, g)).toBe(false);
		expect(setGroupGeometry(out, g, { ...groupGeometry(out, g)!, width: 90 })).toBe(out);
		expect(isStretched(out.nodes[g] as GroupNode)).toBe(true);
	});

	it('cannot be ungrouped once stretched (the thread would be stretched, not rewritten), and says so by being unavailable', () => {
		const { d, g } = withRod();
		expect(canUngroup(d, [g])).toBe(true);
		const out = setGroupGeometry(d, g, { ...groupGeometry(d, g)!, width: 120 }, undefined, open);
		expect(canUngroup(out, [g])).toBe(false);
	});

	it('still refuses a locked group even when unlocked for fasteners', () => {
		const { d, g } = withRod();
		const locked = { ...d, nodes: { ...d.nodes, [g]: { ...d.nodes[g]!, locked: true } } };
		expect(setGroupGeometry(locked, g, { ...groupGeometry(locked, g)!, width: 120 }, undefined, open)).toBe(locked);
	});
});
