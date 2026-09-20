import { describe, expect, it } from 'vitest';
import { dueDatesFor } from './generate';
import type { Chore } from '../db/schema';

function chore(partial: Partial<Chore>): Chore {
	return {
		id: 'c1',
		title: 'Test',
		notes: null,
		assignedMemberId: null,
		recurrence: 'none',
		weekdayMask: 0,
		startDate: null,
		points: 1,
		active: true,
		createdAt: 0,
		...partial
	} as Chore;
}

const from = new Date('2025-09-01'); // Monday
const to = new Date('2025-09-14'); // Sunday (two weeks)

describe('dueDatesFor', () => {
	it('daily → every day in the window', () => {
		expect(dueDatesFor(chore({ recurrence: 'daily' }), from, to)).toHaveLength(14);
	});

	it('weekdays → Mon–Fri only', () => {
		const dates = dueDatesFor(chore({ recurrence: 'weekdays' }), from, to);
		expect(dates).toHaveLength(10);
		expect(dates).not.toContain('2025-09-06'); // Saturday
	});

	it('weekly with a weekday mask → those weekdays', () => {
		// Monday = getDay() 1 → bit 1<<1 = 2; Wednesday = 1<<3 = 8.
		const dates = dueDatesFor(chore({ recurrence: 'weekly', weekdayMask: 2 | 8 }), from, to);
		expect(dates).toEqual(['2025-09-01', '2025-09-03', '2025-09-08', '2025-09-10']);
	});

	it('none → a single instance on the start date', () => {
		expect(dueDatesFor(chore({ recurrence: 'none', startDate: '2025-09-05' }), from, to)).toEqual([
			'2025-09-05'
		]);
	});

	it('respects a recurrence anchor (startDate)', () => {
		const dates = dueDatesFor(
			chore({ recurrence: 'daily', startDate: '2025-09-10' }),
			from,
			to
		);
		expect(dates[0]).toBe('2025-09-10');
		expect(dates).toHaveLength(5);
	});

	it('none → still includes today even when "from" carries the current wall-clock time', () => {
		// Regression: regenerateChore() used to pass `from` as `new Date()` (today at
		// the current time-of-day) rather than midnight. A one-off chore dated today
		// (startDate = midnight) then failed `anchor >= from` for the rest of the day
		// and silently never got a chore_instance.
		const laterToday = new Date('2025-09-05T14:32:00');
		expect(
			dueDatesFor(chore({ recurrence: 'none', startDate: '2025-09-05' }), laterToday, to)
		).toEqual(['2025-09-05']);
	});
});
