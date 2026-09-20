/** Local-time, date-only helpers — a client-safe mirror of $lib/server/date.ts. */
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

export function addDaysIso(iso: string, n: number): string {
	const d = parseIsoDate(iso);
	d.setDate(d.getDate() + n);
	return isoDate(d);
}

/** Whole-day span length between two YYYY-MM-DD strings, inclusive (same day = 1). */
export function spanDays(fromIso: string, toIso: string): number {
	const ms = parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime();
	return Math.round(ms / 86_400_000) + 1;
}

export function fmtTime(unixSec?: number): string {
	if (!unixSec) return '';
	return new Date(unixSec * 1000).toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function fmtRange(start?: number, end?: number, allDay?: boolean): string {
	if (allDay || !start) return 'All day';
	const s = fmtTime(start);
	return end && end - start > 60 ? `${s}–${fmtTime(end)}` : s;
}
