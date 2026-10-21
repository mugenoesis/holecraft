/* The last few errors the page hit, kept in memory for "Copy diagnostics". Messages only: no stack traces with
   file paths, no design data. Gone when the page is closed. */

export interface LoggedError {
	at: string;
	message: string;
}

export const MAX_ERRORS = 10;
const MAX_LENGTH = 500;

let log: LoggedError[] = [];

export function recordError(message: string, now: Date = new Date()): void {
	log = [...log, { at: now.toISOString(), message: message.slice(0, MAX_LENGTH) }].slice(-MAX_ERRORS);
}

export const recentErrors = (): LoggedError[] => [...log];

export function clearErrors(): void {
	log = [];
}

/** A line about whatever was thrown. */
export function describeError(reason: unknown): string {
	if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
	if (typeof reason === 'string') return reason;
	return 'Something that is not an error was thrown';
}

/** Starts recording the page's uncaught errors and rejected promises. */
export function installErrorLog(target: Window): void {
	target.addEventListener('error', (e) => recordError(e.error ? describeError(e.error) : e.message));
	target.addEventListener('unhandledrejection', (e) => recordError(describeError(e.reason)));
}
