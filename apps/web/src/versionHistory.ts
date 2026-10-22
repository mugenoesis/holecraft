const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

const dayNumber = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

/** When a version was saved, in the user's own time: "Today, 09:05", "Yesterday, 23:59", "3 Jan, 10:00", or with the year for an earlier year. */
export function versionWhen(savedAt: string, now: Date): string {
	const at = new Date(savedAt);
	if (Number.isNaN(at.getTime())) return savedAt;
	const time = `${two(at.getHours())}:${two(at.getMinutes())}`;
	const ago = dayNumber(now) - dayNumber(at);
	if (ago === 0) return `Today, ${time}`;
	if (ago === 1) return `Yesterday, ${time}`;
	const day = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
	return `${at.getFullYear() === now.getFullYear() ? day : `${day} ${at.getFullYear()}`}, ${time}`;
}

/** What a version held, in a few words: the design's name then and how many objects it had. */
export function versionDetail(v: { name: string; objectCount: number }): string {
	const count = v.objectCount === 0 ? 'empty' : `${v.objectCount} ${v.objectCount === 1 ? 'object' : 'objects'}`;
	return `${v.name} · ${count}`;
}
