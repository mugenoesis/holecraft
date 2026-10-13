/** True when keystrokes belong to a text field, so global shortcuts must stay out of the way. */
export function isTypingTarget(target: EventTarget | null): boolean {
	return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Input types where a key press is not text going into the field (a slider and a radio take arrows, not digits). */
const NON_TEXT_INPUTS = new Set(['radio', 'checkbox', 'range', 'button', 'submit', 'reset', 'color', 'file', 'image']);

/** True where a digit key is typing: a text field, area or list, or editable content (a radio, slider or button is not). */
export function isTextEntry(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
	return target.tagName === 'INPUT' && !NON_TEXT_INPUTS.has((target as HTMLInputElement).type);
}
