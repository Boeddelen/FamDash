import { asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { members, planItemMembers, planSeries, planSeriesMembers } from './db/schema';

export type MemberRef = { id: string; name: string; emoji: string; color: string };

/** Members linked to a batch of plan_items, keyed by plan_item id. */
export async function getMembersForItems(itemIds: string[]): Promise<Record<string, MemberRef[]>> {
	const out: Record<string, MemberRef[]> = {};
	if (itemIds.length === 0) return out;

	const rows = await db
		.select({
			itemId: planItemMembers.planItemId,
			id: members.id,
			name: members.name,
			emoji: members.emoji,
			color: members.color
		})
		.from(planItemMembers)
		.innerJoin(members, eq(members.id, planItemMembers.memberId))
		.where(inArray(planItemMembers.planItemId, itemIds))
		.orderBy(asc(members.sortOrder));

	for (const r of rows) {
		if (!out[r.itemId]) out[r.itemId] = [];
		out[r.itemId].push({ id: r.id, name: r.name, emoji: r.emoji, color: r.color });
	}
	return out;
}

export async function getMembersFor(itemId: string): Promise<MemberRef[]> {
	const all = await getMembersForItems([itemId]);
	return all[itemId] ?? [];
}

/** Replace a plan_item's full member list with exactly this set. */
export async function setItemMembers(itemId: string, memberIds: string[]): Promise<void> {
	await db.delete(planItemMembers).where(eq(planItemMembers.planItemId, itemId));
	const unique = [...new Set(memberIds)];
	if (unique.length) {
		await db.insert(planItemMembers).values(unique.map((memberId) => ({ planItemId: itemId, memberId })));
	}
}

export async function getSeriesMembers(seriesId: string): Promise<string[]> {
	const rows = await db
		.select({ memberId: planSeriesMembers.memberId })
		.from(planSeriesMembers)
		.where(eq(planSeriesMembers.seriesId, seriesId));
	return rows.map((r) => r.memberId);
}

/** Replace a plan_series' full member list — copied onto every new occurrence generated after this. */
export async function setSeriesMembers(seriesId: string, memberIds: string[]): Promise<void> {
	await db.delete(planSeriesMembers).where(eq(planSeriesMembers.seriesId, seriesId));
	const unique = [...new Set(memberIds)];
	if (unique.length) {
		await db.insert(planSeriesMembers).values(unique.map((memberId) => ({ seriesId, memberId })));
	}
}

/**
 * Exclude one date from a series' future regeneration — used when a single occurrence
 * is deleted or moved off its scheduled day, so the nightly regen doesn't silently
 * recreate it there (the calendar equivalent of an iCal EXDATE).
 */
export async function addSkipDate(seriesId: string, date: string): Promise<void> {
	const series = await db.select({ skipDates: planSeries.skipDates }).from(planSeries).where(eq(planSeries.id, seriesId)).get();
	if (!series) return;
	const next = [...new Set([...series.skipDates, date])];
	await db.update(planSeries).set({ skipDates: next }).where(eq(planSeries.id, seriesId));
}
