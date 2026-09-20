/** Local-time, date-only helpers. All "YYYY-MM-DD" strings are in the server's local zone. */

export function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function parseIsoDate(s: string): Date {
	const [y, m, d] = s.split('-').map(Number);
	return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
	const c = new Date(d);
	c.setDate(c.getDate() + n);
	return c;
}

export function todayIso(): string {
	return isoDate(new Date());
}

/** Monday-based start of the week containing `d`. */
export function startOfWeek(d: Date): Date {
	const c = new Date(d);
	const day = (c.getDay() + 6) % 7; // Mon=0 .. Sun=6
	c.setDate(c.getDate() - day);
	c.setHours(0, 0, 0, 0);
	return c;
}

export function weekDates(anchor: Date): string[] {
	const start = startOfWeek(anchor);
	return Array.from({ length: 7 }, (_, i) => isoDate(addDays(start, i)));
}

/** Calendar grid (weeks x 7) covering the month of `anchor`, Monday-first. */
export function monthGrid(anchor: Date): string[][] {
	const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
	const gridStart = startOfWeek(first);
	const weeks: string[][] = [];
	let cursor = gridStart;
	for (let w = 0; w < 6; w++) {
		const row = Array.from({ length: 7 }, (_, i) => isoDate(addDays(cursor, i)));
		weeks.push(row);
		cursor = addDays(cursor, 7);
		if (w >= 3 && parseIsoDate(row[6]).getMonth() !== anchor.getMonth()) break;
	}
	return weeks;
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function fmtLong(s: string): string {
	return parseIsoDate(s).toLocaleDateString(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
}
