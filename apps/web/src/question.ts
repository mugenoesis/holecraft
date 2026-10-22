/** A question put to the user that the code can wait on: `ask()` resolves with whatever `answer()` is given. Plain, so it is tested without a screen. */
export interface Question<T> {
	/** Opens the question (or joins the one that is open) and waits for its answer. */
	ask: () => Promise<T>;
	answer: (value: T) => void;
	pending: () => boolean;
	subscribe: (listener: () => void) => () => void;
}

export function createQuestion<T>(): Question<T> {
	let waiting: { promise: Promise<T>; resolve: (value: T) => void } | null = null;
	const listeners = new Set<() => void>();
	const tell = () => {
		for (const listener of listeners) listener();
	};
	return {
		ask() {
			if (!waiting) {
				let resolve!: (value: T) => void;
				const promise = new Promise<T>((r) => {
					resolve = r;
				});
				waiting = { promise, resolve };
				tell();
			}
			return waiting.promise;
		},
		answer(value) {
			if (!waiting) return;
			const { resolve } = waiting;
			waiting = null;
			resolve(value);
			tell();
		},
		pending: () => waiting !== null,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
