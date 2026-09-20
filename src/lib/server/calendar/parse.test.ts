import { describe, expect, it } from 'vitest';
import { parseICalToEvents } from './parse';

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:one@test
SUMMARY:Swimming lesson
DTSTART:20260115T160000Z
DTEND:20260115T170000Z
LOCATION:Pool
END:VEVENT
BEGIN:VEVENT
UID:allday@test
SUMMARY:Teacher planning day
DTSTART;VALUE=DATE:20260120
DTEND;VALUE=DATE:20260121
END:VEVENT
BEGIN:VEVENT
UID:weekly@test
SUMMARY:Piano
DTSTART:20260105T150000Z
DTEND:20260105T153000Z
RRULE:FREQ=WEEKLY;COUNT=6
END:VEVENT
BEGIN:VEVENT
UID:faraway@test
SUMMARY:Should be filtered
DTSTART:20270101T100000Z
DTEND:20270101T110000Z
END:VEVENT
END:VCALENDAR`;

describe('parseICalToEvents', () => {
	const events = parseICalToEvents([ICS], new Date('2026-01-01'), new Date('2026-02-01'));

	it('parses simple, all-day and recurring events within the window', () => {
		const titles = events.map((e) => e.title);
		expect(titles).toContain('Swimming lesson');
		expect(titles).toContain('Teacher planning day');
		// COUNT=6 from Jan 5 weekly, but the window ends Feb 1 → Jan 5/12/19/26.
		expect(titles.filter((t) => t === 'Piano')).toHaveLength(4);
	});

	it('flags all-day events', () => {
		expect(events.find((e) => e.title === 'Teacher planning day')?.allDay).toBe(true);
		expect(events.find((e) => e.title === 'Swimming lesson')?.allDay).toBe(false);
	});

	it('keeps the location', () => {
		expect(events.find((e) => e.title === 'Swimming lesson')?.location).toBe('Pool');
	});

	it('excludes events outside the window', () => {
		expect(events.some((e) => e.title === 'Should be filtered')).toBe(false);
	});
});
