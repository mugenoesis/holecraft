import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, HOLD_SLOP, TouchHold } from './touchHold.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('pressing and holding a shape to lift it', () => {
	it('lifts it once the finger has stayed down long enough', () => {
		const onLift = vi.fn();
		const hold = new TouchHold(onLift);
		hold.down(100, 100);
		vi.advanceTimersByTime(HOLD_MS - 1);
		expect(onLift).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onLift).toHaveBeenCalledTimes(1);
		expect(hold.lifted).toBe(true);
	});

	it('does not lift it when the finger moves first: that is a swipe, which scrolls the panel', () => {
		const onLift = vi.fn();
		const hold = new TouchHold(onLift);
		hold.down(100, 100);
		hold.move(100 + HOLD_SLOP + 1, 100);
		vi.advanceTimersByTime(HOLD_MS * 2);
		expect(onLift).not.toHaveBeenCalled();
		expect(hold.lifted).toBe(false);
	});

	it('forgives a finger that wobbles a little', () => {
		const onLift = vi.fn();
		const hold = new TouchHold(onLift);
		hold.down(100, 100);
		hold.move(100 + HOLD_SLOP - 1, 100 - 2);
		vi.advanceTimersByTime(HOLD_MS);
		expect(onLift).toHaveBeenCalledTimes(1);
	});

	it('does not lift it when the finger comes up first: that is a tap', () => {
		const onLift = vi.fn();
		const hold = new TouchHold(onLift);
		hold.down(100, 100);
		vi.advanceTimersByTime(HOLD_MS - 50);
		expect(hold.up()).toBe(false);
		vi.advanceTimersByTime(HOLD_MS);
		expect(onLift).not.toHaveBeenCalled();
	});

	it('says, when the finger comes up, that the release ends a lift (the click that follows is not a tap), and starts afresh', () => {
		const hold = new TouchHold(() => {});
		hold.down(0, 0);
		vi.advanceTimersByTime(HOLD_MS);
		expect(hold.up()).toBe(true);
		expect(hold.lifted).toBe(false);
		hold.down(0, 0);
		expect(hold.up()).toBe(false);
	});

	it('lets go when the browser takes the touch for itself (a cancel)', () => {
		const onLift = vi.fn();
		const hold = new TouchHold(onLift);
		hold.down(0, 0);
		hold.cancel();
		vi.advanceTimersByTime(HOLD_MS * 2);
		expect(onLift).not.toHaveBeenCalled();
	});
});
