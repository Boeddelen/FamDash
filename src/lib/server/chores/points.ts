import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { bonusClaims, choreInstances, chores, rewardRedemptions } from '../db/schema';
import { todayIso, weekDates } from '../date';

export type PointsSummary = {
	/** Points earned from completed chores and claimed bonus tasks, by period. Never
	 * resets — purely additive views. */
	today: number;
	week: number;
	month: number;
	year: number;
	allTimeEarned: number;
	/** Points spent on redeemed rewards, all-time. */
	redeemed: number;
	/** allTimeEarned - redeemed — the number that actually buys a reward. */
	balance: number;
};

const empty = (): PointsSummary => ({
	today: 0,
	week: 0,
	month: 0,
	year: 0,
	allTimeEarned: 0,
	redeemed: 0,
	balance: 0
});

/**
 * Per-child points, broken out by day/week/month/year plus an all-time spendable
 * balance. Each child's numbers are entirely their own — nothing here is ever summed
 * across members, by design (see the chores page and member profile, which render
 * one of these per child rather than a single household total).
 *
 * Two things earn points — a completed chore occurrence and a claimed bonus task —
 * and one spends them: a redeemed reward. All three are plain rows, so an admin
 * undoing any of them (deleting the row) simply takes the points back out of, or hands
 * them back to, the balance on the next read. There is no separate ledger to keep in
 * step.
 */
export async function getPointsSummary(memberIds: string[]): Promise<Record<string, PointsSummary>> {
	const out: Record<string, PointsSummary> = {};
	for (const id of memberIds) out[id] = empty();
	if (memberIds.length === 0) return out;

	const today = todayIso();
	const week = weekDates(new Date());
	const weekStart = week[0];
	const weekEnd = week[6];
	const monthPrefix = today.slice(0, 7); // YYYY-MM
	const yearPrefix = today.slice(0, 4); // YYYY

	/** Credit one earning, dated by the YYYY-MM-DD day it counts *for*. */
	const credit = (memberId: string | null, date: string, points: number) => {
		if (!memberId) return;
		const s = out[memberId];
		if (!s) return;
		s.allTimeEarned += points;
		if (date === today) s.today += points;
		if (date >= weekStart && date <= weekEnd) s.week += points;
		if (date.startsWith(monthPrefix)) s.month += points;
		if (date.startsWith(yearPrefix)) s.year += points;
	};

	const rows = await db
		.select({
			memberId: chores.assignedMemberId,
			dueDate: choreInstances.dueDate,
			points: chores.points
		})
		.from(choreInstances)
		.innerJoin(chores, eq(chores.id, choreInstances.choreId))
		.where(and(eq(choreInstances.status, 'done'), inArray(chores.assignedMemberId, memberIds)));

	for (const r of rows) credit(r.memberId, r.dueDate, r.points);

	// Bonus tasks are dated by `claimedOn` rather than a due date — they have no
	// schedule to be due on — but land in exactly the same buckets.
	const claims = await db
		.select({
			memberId: bonusClaims.memberId,
			claimedOn: bonusClaims.claimedOn,
			points: bonusClaims.points
		})
		.from(bonusClaims)
		.where(inArray(bonusClaims.memberId, memberIds));

	for (const c of claims) credit(c.memberId, c.claimedOn, c.points);

	const redemptions = await db
		.select({ memberId: rewardRedemptions.memberId, spent: sql<number>`sum(${rewardRedemptions.pointsCost})` })
		.from(rewardRedemptions)
		.where(inArray(rewardRedemptions.memberId, memberIds))
		.groupBy(rewardRedemptions.memberId);

	for (const r of redemptions) {
		const s = out[r.memberId];
		if (!s) continue;
		s.redeemed = Number(r.spent) || 0;
	}

	for (const s of Object.values(out)) s.balance = s.allTimeEarned - s.redeemed;
	return out;
}

export async function getPointsSummaryFor(memberId: string): Promise<PointsSummary> {
	const all = await getPointsSummary([memberId]);
	return all[memberId] ?? empty();
}
