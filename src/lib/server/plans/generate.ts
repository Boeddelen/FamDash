import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '../db';
import { entityTags, planItemMembers, planItems, planSeries } from '../db/schema';
import { addDays, isoDate, parseIsoDate } from '../date';
import { dueDatesFor } from '../recurrence';
import { getSeriesMembers } from '../plans';
import { getTagsFor } from '../tags';

// Recurring notations look further ahead than chores (a family calendar wants to show
// "swim practice" for the next few months, not just the next six weeks). Past
// occurrences that already exist — and anything already ticked off — are preserved.
const WINDOW_FWD = 90;

/** Ensure plan_items occurrences exist for one recurring series across the rolling window. */
export async function regenerateSeries(seriesId: string): Promise<void> {
	const series = await db.select().from(planSeries).where(eq(planSeries.id, seriesId)).get();
	if (!series) return;

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const to = addDays(today, WINDOW_FWD);
	const wanted = series.active
		? new Set(dueDatesFor(series, today, to).filter((d) => !series.skipDates.includes(d)))
		: new Set<string>();

	const existing = await db
		.select()
		.from(planItems)
		.where(
			and(
				eq(planItems.seriesId, seriesId),
				gte(planItems.date, isoDate(today)),
				lte(planItems.date, isoDate(to))
			)
		);
	const haveByDate = new Map(existing.map((e) => [e.date, e]));

	// Insert missing occurrences, carrying the series' current template fields.
	const toInsert = [...wanted].filter((date) => !haveByDate.has(date));
	if (toInsert.length) {
		const rows = await db
			.insert(planItems)
			.values(
				toInsert.map((date) => ({
					seriesId,
					title: series.title,
					date,
					endDate:
						series.durationDays > 1
							? isoDate(addDays(parseIsoDate(date), series.durationDays - 1))
							: null,
					time: series.time,
					category: series.category,
					notes: series.notes
				}))
			)
			.returning();

		// New rows only — no existing links to replace, so a single batch insert each
		// (rather than a per-row delete+insert) is both correct and far cheaper.
		const memberIds = await getSeriesMembers(seriesId);
		if (memberIds.length) {
			await db
				.insert(planItemMembers)
				.values(rows.flatMap((row) => memberIds.map((memberId) => ({ planItemId: row.id, memberId }))));
		}
		const tagIds = (await getTagsFor('plan_series', seriesId)).map((t) => t.id);
		if (tagIds.length) {
			await db.insert(entityTags).values(
				rows.flatMap((row) =>
					tagIds.map((tagId) => ({ tagId, entityType: 'plan_item' as const, entityId: row.id }))
				)
			);
		}
	}

	// Remove future, not-yet-actioned occurrences that are no longer scheduled (the
	// series was edited to drop a weekday, paused, etc.) — mirrors chore instance cleanup.
	const orphanIds = existing
		.filter((e) => !wanted.has(e.date) && !e.done && e.date >= isoDate(today))
		.map((e) => e.id);
	if (orphanIds.length) await db.delete(planItems).where(inArray(planItems.id, orphanIds));
}

export async function regenerateAllSeries(): Promise<void> {
	const all = await db.select({ id: planSeries.id }).from(planSeries);
	for (const s of all) await regenerateSeries(s.id);
}
