import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { bonusClaims, chores, choreInstances, members, rewardRedemptions } from '../db/schema';
import { runMigrations } from '../db/migrate';
import { isoDate, todayIso, weekDates } from '../date';
import { getPointsSummary, getPointsSummaryFor } from './points';

beforeAll(() => {
	runMigrations();
});

async function makeMember(name: string) {
	return db.insert(members).values({ name }).returning().get();
}

async function makeChore(memberId: string, points: number, title = 'chore') {
	return db
		.insert(chores)
		.values({ title, assignedMemberId: memberId, points })
		.returning()
		.get();
}

async function makeInstance(choreId: string, dueDate: string, status: 'todo' | 'done') {
	return db.insert(choreInstances).values({ choreId, dueDate, status }).returning().get();
}

describe('getPointsSummary', () => {
	it('buckets a single member\'s completed chores by day/week/month/year, and totals all-time', async () => {
		const m = await makeMember('Test Child A');
		const today = new Date();
		const todayStr = todayIso();

		// Same year, a different month (~6 months off — can never land in this week or this month).
		const sixMonthsOff = isoDate(new Date(today.getFullYear(), (today.getMonth() + 6) % 12, 10));
		// A previous year entirely.
		const prevYear = isoDate(new Date(today.getFullYear() - 1, 5, 10));

		const cToday = await makeChore(m.id, 5, 'today chore');
		const cYear = await makeChore(m.id, 7, 'this year, other month');
		const cAllTime = await makeChore(m.id, 11, 'previous year');
		const cIgnored = await makeChore(m.id, 100, 'not done');

		await makeInstance(cToday.id, todayStr, 'done');
		await makeInstance(cYear.id, sixMonthsOff, 'done');
		await makeInstance(cAllTime.id, prevYear, 'done');
		await makeInstance(cIgnored.id, todayStr, 'todo'); // not done — must not count anywhere

		await db.insert(rewardRedemptions).values({ memberId: m.id, title: 'Movie night', pointsCost: 6 });

		const summary = await getPointsSummaryFor(m.id);

		expect(summary.today).toBe(5);
		expect(summary.week).toBe(5);
		expect(summary.month).toBe(5);
		expect(summary.year).toBe(5 + 7);
		expect(summary.allTimeEarned).toBe(5 + 7 + 11);
		expect(summary.redeemed).toBe(6);
		expect(summary.balance).toBe(5 + 7 + 11 - 6);
	});

	it('keeps each member\'s numbers entirely separate — never sums across members', async () => {
		const a = await makeMember('Sibling A');
		const b = await makeMember('Sibling B');
		const today = todayIso();

		const cA = await makeChore(a.id, 4, 'a chore');
		const cB = await makeChore(b.id, 9, 'b chore');
		await makeInstance(cA.id, today, 'done');
		await makeInstance(cB.id, today, 'done');

		const summary = await getPointsSummary([a.id, b.id]);

		expect(summary[a.id].today).toBe(4);
		expect(summary[b.id].today).toBe(9);
		// Neither total leaks into the other.
		expect(summary[a.id].allTimeEarned).toBe(4);
		expect(summary[b.id].allTimeEarned).toBe(9);
	});

	it('a day elsewhere in the current week counts for week/month/year but not "today"', async () => {
		const m = await makeMember('Test Child B');
		const today = todayIso();
		const week = weekDates(new Date());
		const otherDay = week.find((d) => d !== today)!;

		const c = await makeChore(m.id, 3, 'week chore');
		await makeInstance(c.id, otherDay, 'done');

		const summary = await getPointsSummaryFor(m.id);
		expect(summary.today).toBe(0);
		expect(summary.week).toBe(3);
		expect(summary.allTimeEarned).toBe(3);
	});

	it('counts a claimed bonus task as earned points, bucketed by the day it was claimed for', async () => {
		const m = await makeMember('Bonus Child');
		const today = todayIso();
		// Same year, a different month — outside this week and this month, inside the year.
		const now = new Date();
		const otherMonth = isoDate(new Date(now.getFullYear(), (now.getMonth() + 6) % 12, 10));

		await db
			.insert(bonusClaims)
			.values({ memberId: m.id, title: 'Wash the car', points: 15, claimedOn: today });
		await db
			.insert(bonusClaims)
			.values({ memberId: m.id, title: 'Weed the garden', points: 4, claimedOn: otherMonth });

		const summary = await getPointsSummaryFor(m.id);
		expect(summary.today).toBe(15);
		expect(summary.week).toBe(15);
		expect(summary.month).toBe(15);
		expect(summary.year).toBe(15 + 4);
		expect(summary.allTimeEarned).toBe(15 + 4);
		expect(summary.balance).toBe(15 + 4);
	});

	it('bonus points and chore points add up into the same buckets, and stay per child', async () => {
		const a = await makeMember('Mixed Earner');
		const b = await makeMember('Bystander');
		const today = todayIso();

		const c = await makeChore(a.id, 6, 'mixed chore');
		await makeInstance(c.id, today, 'done');
		await db
			.insert(bonusClaims)
			.values({ memberId: a.id, title: 'Extra bonus', points: 9, claimedOn: today });

		const summary = await getPointsSummary([a.id, b.id]);
		expect(summary[a.id].today).toBe(6 + 9);
		expect(summary[a.id].allTimeEarned).toBe(6 + 9);
		// Nothing leaks sideways — bonus points are as per-child as everything else.
		expect(summary[b.id].allTimeEarned).toBe(0);
	});

	it('deleting a redemption hands the points straight back — that is the whole roll-back', async () => {
		const m = await makeMember('Refunded Child');
		const c = await makeChore(m.id, 20, 'earner');
		await makeInstance(c.id, todayIso(), 'done');

		const redemption = await db
			.insert(rewardRedemptions)
			.values({ memberId: m.id, title: 'Cinema', pointsCost: 12 })
			.returning()
			.get();
		expect((await getPointsSummaryFor(m.id)).balance).toBe(8);

		await db.delete(rewardRedemptions).where(eq(rewardRedemptions.id, redemption.id));

		const after = await getPointsSummaryFor(m.id);
		expect(after.redeemed).toBe(0);
		expect(after.balance).toBe(20);
		// The roll-back refunds only the spend — nothing about what was earned changes.
		expect(after.allTimeEarned).toBe(20);
	});

	it('deleting a bonus claim takes those points back out again', async () => {
		const m = await makeMember('Undone Child');
		const claim = await db
			.insert(bonusClaims)
			.values({ memberId: m.id, title: 'Shovel snow', points: 7, claimedOn: todayIso() })
			.returning()
			.get();
		expect((await getPointsSummaryFor(m.id)).balance).toBe(7);

		await db.delete(bonusClaims).where(eq(bonusClaims.id, claim.id));
		expect((await getPointsSummaryFor(m.id)).balance).toBe(0);
	});

	it('returns zeroed defaults for members with no history, and {} for no ids', async () => {
		expect(await getPointsSummary([])).toEqual({});

		const m = await makeMember('Fresh Member');
		const summary = await getPointsSummaryFor(m.id);
		expect(summary).toEqual({
			today: 0,
			week: 0,
			month: 0,
			year: 0,
			allTimeEarned: 0,
			redeemed: 0,
			balance: 0
		});
	});
});
