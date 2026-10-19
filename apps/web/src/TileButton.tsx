import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import { useTouchLift } from './useTouchLift.ts';
import { armsOnClick } from './viewport/placement.ts';

interface Props {
	/** What the tile carries when it is dragged (a shape type, or a saved shape's id) and how the viewport tells which it is. */
	dragType: string;
	dragValue: string;
	/** Whether it is the one armed to be put down with the next click on the plate. */
	armed: boolean;
	/** A tap, Enter or Space: add it at once. */
	onAdd: () => void;
	/** A mouse or pen click: arm it (or, if armed already, let go of it). */
	onArm: () => void;
	/** A finger has pressed and held it long enough to lift it (the viewport takes the drag from here), and has let go. */
	onLift: () => void;
	onRelease: () => void;
	children: ReactNode;
}

/**
 * A tile of the Shapes panel (built-in or saved). A mouse click arms it; a tap or Enter adds it at once; dragging it onto the view drops it
 * (a mouse), and pressing and holding it, then dragging, does the same with a finger. A click cannot tell a mouse from a finger or the keyboard,
 * so the tile reads what pressed it.
 */
export function TileButton({ dragType, dragValue, armed, onAdd, onArm, onLift, onRelease, children }: Props) {
	const pointer = useRef('');
	const lift = useTouchLift(onLift, onRelease);

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		onAdd();
	};

	return (
		<div
			role="button"
			tabIndex={0}
			draggable={!lift.touching}
			aria-pressed={armed}
			className={armed ? 'shape-tile armed' : 'shape-tile'}
			onPointerDown={(e) => {
				pointer.current = e.pointerType;
				lift.handlers.onPointerDown(e);
			}}
			onPointerMove={lift.handlers.onPointerMove}
			onPointerUp={lift.handlers.onPointerUp}
			onPointerCancel={lift.handlers.onPointerCancel}
			onClick={() => {
				const by = pointer.current;
				pointer.current = '';
				if (lift.consumeClick()) return;
				if (armsOnClick(by)) onArm();
				else onAdd();
			}}
			onKeyDown={onKeyDown}
			onDragStart={(e) => {
				if (lift.handlers.onDragStart(e)) return;
				e.dataTransfer.setData(dragType, dragValue);
				e.dataTransfer.effectAllowed = 'copy';
			}}
		>
			{children}
		</div>
	);
}
