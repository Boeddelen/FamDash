import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { choreInstances, chores } from '../db/schema';
import { addDays, isoDate } from '../date';

const LOOKBACK_DAYS = 30;

/**
 * Current daily-completion streak per member: the number of consecutive days
 * (counting back from today, or from yesterday if today isn't finished yet) on
 * which every chore assigned to them was completed. A day with no chores assigned
 * to that member breaks the streak rather than being skipped — keeps the number
 * honest instead of drifting upward on quiet days.
 */
export async function getStreaks(memberIds: string[]): Promise<Record<string, number>> {
	const out: Record<string, number> = Object.fromEntries(memberIds.map((id) => [id, 0]));
	if (memberIds.length === 0) return out;

	const today = new Date();
	const from = isoDate(addDays(today, -LOOKBACK_DAYS));
	const to = isoDate(today);

	const rows = await db
		.select({
			memberId: chores.assignedMemberId,
			dueDate: choreInstances.dueDate,
			status: choreInstances.status
		})
		.from(choreInstances)
		.innerJoin(chores, eq(chores.id, choreInstances.choreId))
		.where(and(gte(choreInstances.dueDate, from), lte(choreInstances.dueDate, to)));

	// memberId -> dueDate -> { total, done }
	const byMember = new Map<string, Map<string, { total: number; done: number }>>();
	for (const r of rows) {
		if (!r.memberId) continue;
		if (!byMember.has(r.memberId)) byMember.set(r.memberId, new Map());
		const days = byMember.get(r.memberId)!;
		const d = days.get(r.dueDate) ?? { total: 0, done: 0 };
		d.total++;
		if (r.status === 'done') d.done++;
		days.set(r.dueDate, d);
	}

	for (const id of memberIds) {
		const days = byMember.get(id);
		if (!days) continue;
		const todayInfo = days.get(to);
		const todayDone = Boolean(todayInfo && todayInfo.total > 0 && todayInfo.done === todayInfo.total);
		let cursor = todayDone ? today : addDays(today, -1);
		let streak = 0;
		for (;;) {
			const info = days.get(isoDate(cursor));
			if (!info || info.total === 0 || info.done < info.total) break;
			streak++;
			cursor = addDays(cursor, -1);
		}
		out[id] = streak;
	}
	return out;
}
