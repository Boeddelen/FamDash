import { asc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { members, planItems, planSeries, tags as tagsTable } from '../db/schema';
import { runMigrations } from '../db/migrate';
import { isoDate } from '../date';
import { getMembersFor, setSeriesMembers } from '../plans';
import { getTagsFor, setEntityTags } from '../tags';
import { regenerateSeries } from './generate';

beforeAll(() => {
	runMigrations();
});

async function makeMember(name: string) {
	return db.insert(members).values({ name }).returning().get();
}

async function occurrencesFor(seriesId: string) {
	return db.select().from(planItems).where(eq(planItems.seriesId, seriesId)).orderBy(asc(planItems.date));
}

// Every day of the week — so a test never depends on which weekday it happens to run on.
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6].reduce((mask, d) => mask | (1 << d), 0);

describe('regenerateSeries', () => {
	it('materialises occurrences going forward, carrying the series members and tags', async () => {
		const m1 = await makeMember('Series Child A');
		const m2 = await makeMember('Series Child B');
		const tag = await db.insert(tagsTable).values({ label: 'Swim' }).returning().get();

		const series = await db
			.insert(planSeries)
			.values({
				title: 'Swim practice',
				recurrence: 'custom',
				weekdayMask: EVERY_DAY,
				startDate: isoDate(new Date())
			})
			.returning()
			.get();
		await setSeriesMembers(series.id, [m1.id, m2.id]);
		await setEntityTags('plan_series', series.id, [tag.id]);

		await regenerateSeries(series.id);

		const occurrences = await occurrencesFor(series.id);
		expect(occurrences.length).toBeGreaterThan(30); // ~90-day forward window, every day

		const first = occurrences[0];
		expect(first.title).toBe('Swim practice');
		const linkedMembers = (await getMembersFor(first.id)).map((m) => m.id).sort();
		expect(linkedMembers).toEqual([m1.id, m2.id].sort());
		expect((await getTagsFor('plan_item', first.id)).map((t) => t.id)).toEqual([tag.id]);
	});

	it('spans multiple days per occurrence when durationDays > 1', async () => {
		const series = await db
			.insert(planSeries)
			.values({
				title: 'Long weekend',
				recurrence: 'custom',
				weekdayMask: EVERY_DAY,
				startDate: isoDate(new Date()),
				durationDays: 3
			})
			.returning()
			.get();

		await regenerateSeries(series.id);
		const [first] = await occurrencesFor(series.id);
		const spanMs =
			new Date(first.endDate!).getTime() - new Date(first.date).getTime();
		expect(Math.round(spanMs / 86_400_000)).toBe(2); // 3-day span, inclusive = +2 days
	});

	it('excludes skipped dates and does not regenerate a manually-removed occurrence', async () => {
		const series = await db
			.insert(planSeries)
			.values({
				title: 'Daily thing',
				recurrence: 'daily',
				weekdayMask: 0,
				startDate: isoDate(new Date())
			})
			.returning()
			.get();

		await regenerateSeries(series.id);
		const before = await occurrencesFor(series.id);
		const toSkip = before[2];

		// Simulate deleting a single occurrence: mark it skipped and remove the row,
		// the way the DELETE /api/plan-items/[id] route does.
		await db.update(planSeries).set({ skipDates: [toSkip.date] }).where(eq(planSeries.id, series.id));
		await db.delete(planItems).where(eq(planItems.id, toSkip.id));

		await regenerateSeries(series.id);
		const after = await occurrencesFor(series.id);
		expect(after.find((o) => o.date === toSkip.date)).toBeUndefined();
		// every other date is still there
		expect(after.length).toBe(before.length - 1);
	});

	it('removes future, not-yet-done occurrences that fall out of an edited schedule, but keeps completed ones', async () => {
		const series = await db
			.insert(planSeries)
			.values({
				title: 'Editable thing',
				recurrence: 'custom',
				weekdayMask: EVERY_DAY,
				startDate: isoDate(new Date())
			})
			.returning()
			.get();
		await regenerateSeries(series.id);
		const before = await occurrencesFor(series.id);

		// Mark one future occurrence done, then narrow the schedule down to nothing.
		const doneOne = before[1];
		await db.update(planItems).set({ done: true }).where(eq(planItems.id, doneOne.id));
		await db.update(planSeries).set({ weekdayMask: 0, recurrence: 'custom' }).where(eq(planSeries.id, series.id));

		await regenerateSeries(series.id);
		const after = await occurrencesFor(series.id);

		expect(after.find((o) => o.id === doneOne.id)).toBeDefined(); // preserved — already done
		expect(after.length).toBe(1); // everything else, being un-actioned, was cleaned up
	});

	it('does nothing for an unknown series id', async () => {
		await expect(regenerateSeries('nonexistent-series-id')).resolves.toBeUndefined();
	});
});
