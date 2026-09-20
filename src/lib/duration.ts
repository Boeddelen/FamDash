import type { Translator } from './i18n';

/** Shared by consequences and rewards: how long a dealt/redeemed catalog item stays
 * in effect before it "times out". Null on the catalog row = no timer, same as today. */
export const DURATION_UNITS = ['days', 'weeks', 'months'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

/**
 * Adds a duration to a date. Months use JS Date's own calendar rollover (Jan 31 + 1
 * month lands on Mar 3, not clamped to Feb 28) — fine for "roughly N months from now",
 * not a billing-cycle calculator.
 */
export function addDuration(from: Date, value: number, unit: DurationUnit): Date {
	const d = new Date(from);
	if (unit === 'days') d.setDate(d.getDate() + value);
	else if (unit === 'weeks') d.setDate(d.getDate() + value * 7);
	else d.setMonth(d.getMonth() + value);
	return d;
}

/** e.g. formatDuration(3, 'days', t) → "3 days" / "3 dager". */
export function formatDuration(value: number, unit: DurationUnit, t: Translator): string {
	return t(`duration.${unit}.${value === 1 ? 'one' : 'many'}`, { value });
}

/** Unix-seconds timestamp a catalog item's duration resolves to from now, or null for
 * a catalog item with no duration configured. Used at draw/redeem time so the result
 * is snapshotted rather than recomputed from a since-edited catalog row. */
export function computeExpiresAt(durationValue: number | null, durationUnit: string | null): number | null {
	if (!durationValue || !durationUnit) return null;
	return Math.floor(addDuration(new Date(), durationValue, durationUnit as DurationUnit).getTime() / 1000);
}

/** "until 20 Sept" (still running) or "ended 20 Sept" (past) for a history row's
 * snapshotted expiry — null when that draw/redemption had no duration set. */
export function expiryLabel(expiresAt: number | null, t: Translator, localeTag: string): string | null {
	if (!expiresAt) return null;
	const date = new Date(expiresAt * 1000).toLocaleDateString(localeTag, { day: 'numeric', month: 'short' });
	return t(expiresAt * 1000 < Date.now() ? 'duration.expired' : 'duration.until', { date });
}
