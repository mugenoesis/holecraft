import { type DragEvent, type PointerEvent, useRef, useState } from 'react';
import { TouchHold } from './touchHold.ts';

/**
 * Press and hold on a tile with a finger to lift its shape, then drag it onto the plate (the viewport follows the finger and puts it down
 * where it comes up). A swipe scrolls the panel and a tap adds the shape, as before. Returns the handlers for the tile, and whether the last
 * press was a finger (the tile then is not draggable the browser's way, which would take the touch from us).
 */
export function useTouchLift(onLift: () => void, onRelease: () => void) {
	const latest = useRef({ onLift, onRelease });
	latest.current = { onLift, onRelease };
	const hold = useRef<TouchHold | null>(null);
	hold.current ??= new TouchHold(() => latest.current.onLift());
	// the click that ends a lift is not a tap on the tile
	const ignoreClick = useRef(false);
	const [touching, setTouching] = useState(false);

	return {
		touching,
		handlers: {
			onPointerDown: (e: PointerEvent) => {
				const finger = e.pointerType === 'touch';
				setTouching(finger);
				if (finger) hold.current?.down(e.clientX, e.clientY);
			},
			onPointerMove: (e: PointerEvent) => hold.current?.move(e.clientX, e.clientY),
			onPointerUp: () => {
				if (hold.current?.up()) ignoreClick.current = true;
				latest.current.onRelease();
			},
			onPointerCancel: () => {
				hold.current?.cancel();
				latest.current.onRelease();
			},
			/** A finger that is lifting a shape starts no native drag. */
			onDragStart: (e: DragEvent): boolean => {
				if (!touching) return false;
				e.preventDefault();
				return true;
			},
		},
		/** True once, for the click that follows a lift: skip it. */
		consumeClick: (): boolean => {
			const was = ignoreClick.current;
			ignoreClick.current = false;
			return was;
		},
	};
}
