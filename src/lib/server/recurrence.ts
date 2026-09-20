import { addDays, isoDate, parseIsoDate } from './date';

/**
 * The minimal shape shared by anything that repeats on a schedule — chores and
 * recurring calendar notations (plan_series) both fit this. Kept here so the date
 * math lives in exactly one place.
 */
export type RecurrenceLike = {
	recurrence: string; // 'none' | 'daily' | 'weekly' | 'weekdays' | 'custom'
	weekdayMask: number; // for weekly/custom: bitmask of weekdays, Sun=1<<0 .. Sat=1<<6
	startDate: string | null; // YYYY-MM-DD, one-off date or recurrence anchor
};

/** Weekday bit for a JS Date (Sun=bit0 .. Sat=bit6). */
function weekdayBit(d: Date): number {
	return 1 << d.getDay();
}

/** All dates (YYYY-MM-DD) something on this schedule falls on within [fromInput, toInput]. */
export function dueDatesFor(item: RecurrenceLike, fromInput: Date, toInput: Date): string[] {
	// Compare whole calendar days, not exact instants: startDate is always midnight, so a
	// `from` carrying the current wall-clock time (e.g. `new Date()`) would otherwise make
	// a same-day "none" item fail `anchor >= from` after 00:00.
	const from = new Date(fromInput);
	from.setHours(0, 0, 0, 0);
	const to = new Date(toInput);
	to.setHours(0, 0, 0, 0);

	const out: string[] = [];
	const anchor = item.startDate ? parseIsoDate(item.startDate) : null;

	if (item.recurrence === 'none') {
		if (item.startDate && anchor && anchor >= from && anchor <= to) out.push(item.startDate);
		return out;
	}

	for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
		if (anchor && d < anchor) continue;
		switch (item.recurrence) {
			case 'daily':
				out.push(isoDate(d));
				break;
			case 'weekdays':
				if (d.getDay() >= 1 && d.getDay() <= 5) out.push(isoDate(d));
				break;
			case 'weekly':
			case 'custom':
				if (item.weekdayMask & weekdayBit(d)) out.push(isoDate(d));
				break;
		}
	}
	return out;
}
