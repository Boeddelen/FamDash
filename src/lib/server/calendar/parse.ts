import ical, { type CalendarResponse, type EventInstance, type VEvent } from 'node-ical';
import type { NormalizedEvent } from './types';

const sec = (d: Date) => Math.floor(d.getTime() / 1000);

/** node-ical returns either a string or a { val, params } wrapper for text props. */
function text(v: unknown): string {
	if (v == null) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'object' && 'val' in (v as Record<string, unknown>)) {
		return String((v as { val: unknown }).val ?? '');
	}
	return String(v);
}

/**
 * Parse one or more iCal documents into normalized events occurring within
 * [from, to], expanding recurrence rules.
 */
export function parseICalToEvents(
	icalStrings: string[],
	from: Date,
	to: Date
): NormalizedEvent[] {
	const out: NormalizedEvent[] = [];
	const seen = new Set<string>();

	for (const raw of icalStrings) {
		let parsed: CalendarResponse;
		try {
			parsed = ical.sync.parseICS(raw);
		} catch {
			continue;
		}
		for (const comp of Object.values(parsed)) {
			if (!comp || comp.type !== 'VEVENT') continue;
			const ev = comp as VEvent;
			const title = text(ev.summary).trim() || '(untitled)';
			const location = text(ev.location).trim() || undefined;
			const description = text(ev.description).trim() || undefined;

			const pushInstance = (start: Date, end: Date, allDay: boolean, key: string) => {
				if (end < from || start > to) return;
				if (seen.has(key)) return;
				seen.add(key);
				out.push({
					uid: ev.uid || key,
					title,
					start: sec(start),
					end: sec(end),
					allDay,
					location,
					description
				});
			};

			if ((ev as { rrule?: unknown }).rrule) {
				let instances: EventInstance[] = [];
				try {
					instances = ical.expandRecurringEvent(ev, { from, to, expandOngoing: true });
				} catch {
					instances = [];
				}
				for (const inst of instances) {
					pushInstance(
						inst.start,
						inst.end ?? inst.start,
						Boolean(inst.isFullDay),
						`${ev.uid}::${inst.start.toISOString()}`
					);
				}
			} else {
				const start = ev.start as Date;
				const end = (ev.end as Date) ?? start;
				const allDay = (ev as { datetype?: string }).datetype === 'date';
				pushInstance(start, end, allDay, `${ev.uid}::${start?.toISOString?.() ?? Math.random()}`);
			}
		}
	}
	return out;
}
