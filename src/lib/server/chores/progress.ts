import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { bonusClaims, choreInstances, chores } from '../db/schema';
import { todayIso } from '../date';

export type DayProgress = {
	/** Chore occurrences due today that are ticked off. */
	done: number;
	/** Chore occurrences due today, ticked or not. Zero means nothing was asked of
	 *  this member today — the avatar ring is then hidden entirely rather than drawn
	 *  empty, since an empty ring would read as "behind" on a day off. */
	total: number;
	/** Whether they claimed at least one bonus task today. Only ever the *fourth*
	 *  state of the ring (glow) — going past what was asked only counts once the
	 *  day's chores are actually finished. */
	bonus: boolean;
};

/**
 * "How far is each member through today?" — the number behind the ring drawn around
 * every avatar (`Avatar.svelte`). Deliberately *today only*, not the rolling week the
 * chore decks show and not the calendar week points score: the ring answers "am I done
 * for today", which is the question a child standing at the wall tablet is asking.
 *
 * Loaded once per request in `+layout.server.ts` so every avatar in the app can draw
 * its ring without each page threading progress data down through props.
 */
export async function getTodayProgress(memberIds: string[]): Promise<Record<string, DayProgress>> {
	const out: Record<string, DayProgress> = {};
	for (const id of memberIds) out[id] = { done: 0, total: 0, bonus: false };
	if (memberIds.length === 0) return out;

	const today = todayIso();

	const rows = await db
		.select({ memberId: chores.assignedMemberId, status: choreInstances.status })
		.from(choreInstances)
		.innerJoin(chores, eq(chores.id, choreInstances.choreId))
		.where(and(eq(choreInstances.dueDate, today), inArray(chores.assignedMemberId, memberIds)));

	for (const r of rows) {
		const p = r.memberId ? out[r.memberId] : undefined;
		if (!p) continue;
		// A skipped occurrence still counted as something asked of them, so it stays in
		// the denominator — the ring only closes when the work is actually done.
		p.total++;
		if (r.status === 'done') p.done++;
	}

	const claims = await db
		.select({ memberId: bonusClaims.memberId })
		.from(bonusClaims)
		.where(and(eq(bonusClaims.claimedOn, today), inArray(bonusClaims.memberId, memberIds)));

	for (const c of claims) {
		const p = out[c.memberId];
		if (p) p.bonus = true;
	}

	return out;
}
