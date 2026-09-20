import { describe, expect, it } from 'vitest';
import { lastSaturdayStart } from './school';

/**
 * The archive cutoff is the one piece of this feature that can silently be a week wrong,
 * and it only misbehaves on particular days — so it's pinned here rather than left to be
 * noticed on some future Saturday.
 */
describe('lastSaturdayStart', () => {
	const at = (iso: string) => lastSaturdayStart(new Date(iso));
	const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	it('returns today when it is already Saturday', () => {
		// 2026-09-19 is a Saturday.
		expect(day(at('2026-09-19T13:45:00'))).toBe('2026-09-19');
	});

	it('does not jump forward to the coming Saturday mid-week', () => {
		// Thursday — the current school week is still running, so the cutoff is the
		// Saturday that has already been and gone.
		expect(day(at('2026-09-17T08:00:00'))).toBe('2026-09-12');
	});

	it('treats Sunday as belonging to the Saturday just passed', () => {
		expect(day(at('2026-09-20T23:59:00'))).toBe('2026-09-19');
	});

	it('is a midnight boundary, not the current time of day', () => {
		const d = at('2026-09-19T13:45:30');
		expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
	});

	it('is stable across a month boundary', () => {
		// Thursday 2026-10-01 — the previous Saturday is in September.
		expect(day(at('2026-10-01T09:00:00'))).toBe('2026-09-26');
	});
});
