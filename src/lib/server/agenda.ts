import { and, asc, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { db } from './db';
import {
	calendarConnections,
	calendarEvents,
	choreInstances,
	chores,
	members,
	planItems
} from './db/schema';
import { addDays, isoDate, parseIsoDate } from './date';
import { getTagsForEntities, type TagRef } from './tags';
import { getMembersForItems, type MemberRef } from './plans';

export type AgendaEvent = {
	id: string;
	kind: 'calendar' | 'school';
	title: string;
	date: string;
	endDate?: string;
	start?: number;
	end?: number;
	allDay: boolean;
	color: string;
	location?: string;
};

export type AgendaChore = {
	id: string;
	choreId: string;
	title: string;
	dueDate: string;
	time: string | null;
	category: string | null;
	checklist: string[] | null;
	checklistDone: number[] | null;
	status: 'todo' | 'done' | 'skipped';
	points: number;
	memberId: string | null;
	memberName: string | null;
	memberEmoji: string | null;
	memberColor: string | null;
	completedByName: string | null;
	tags: TagRef[];
};

export type AgendaPlanItem = typeof planItems.$inferSelect & {
	members: MemberRef[];
	tags: TagRef[];
};

function spanDays(fromIso: string, toIso: string): string[] {
	const out: string[] = [];
	for (let d = parseIsoDate(fromIso); isoDate(d) <= toIso; d = addDays(d, 1)) out.push(isoDate(d));
	return out;
}

/** All calendar + school events overlapping [fromIso, toIso], keyed per day. */
export async function eventsInRange(fromIso: string, toIso: string): Promise<AgendaEvent[]> {
	const fromSec = Math.floor(parseIsoDate(fromIso).getTime() / 1000);
	const toSec = Math.floor(parseIsoDate(toIso).getTime() / 1000) + 86_400;

	const conns = await db.select().from(calendarConnections).where(eq(calendarConnections.enabled, true));
	const colorByConn = new Map(conns.map((c) => [c.id, c.color]));

	const cal = conns.length
		? await db
				.select()
				.from(calendarEvents)
				.where(
					and(
						inArray(
							calendarEvents.connectionId,
							conns.map((c) => c.id)
						),
						lte(calendarEvents.start, toSec),
						gte(calendarEvents.end, fromSec)
					)
				)
		: [];

	const out: AgendaEvent[] = [];
	for (const e of cal) {
		out.push({
			id: e.id,
			kind: 'calendar',
			title: e.title,
			date: isoDate(new Date(e.start * 1000)),
			start: e.start,
			end: e.end,
			allDay: e.allDay,
			color: colorByConn.get(e.connectionId) ?? '#0ea5e9',
			location: e.location ?? undefined
		});
	}
	return out.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

export async function choresInRange(fromIso: string, toIso: string): Promise<AgendaChore[]> {
	const rows = await db
		.select({ inst: choreInstances, chore: chores, member: members })
		.from(choreInstances)
		.innerJoin(chores, eq(chores.id, choreInstances.choreId))
		.leftJoin(members, eq(members.id, chores.assignedMemberId))
		.where(and(gte(choreInstances.dueDate, fromIso), lte(choreInstances.dueDate, toIso)))
		.orderBy(asc(choreInstances.dueDate));

	const completedBy = new Map(
		(await db.select({ id: members.id, name: members.name }).from(members)).map((m) => [m.id, m.name])
	);
	const tagsByChore = await getTagsForEntities('chore', [...new Set(rows.map((r) => r.chore.id))]);

	return rows.map(({ inst, chore, member }) => ({
		id: inst.id,
		choreId: chore.id,
		title: chore.title,
		dueDate: inst.dueDate,
		time: chore.time,
		category: chore.category,
		checklist: chore.checklist,
		checklistDone: inst.checklistDone,
		status: inst.status as 'todo' | 'done' | 'skipped',
		points: chore.points,
		memberId: member?.id ?? null,
		memberName: member?.name ?? null,
		memberEmoji: member?.emoji ?? null,
		memberColor: member?.color ?? null,
		completedByName: inst.completedByMemberId
			? (completedBy.get(inst.completedByMemberId) ?? null)
			: null,
		tags: tagsByChore[chore.id] ?? []
	}));
}

export async function planItemsInRange(fromIso: string, toIso: string): Promise<AgendaPlanItem[]> {
	// Interval overlap, not just a start-date match — a multi-day notation that started
	// before `fromIso` can still span into the requested window.
	const rows = await db
		.select()
		.from(planItems)
		.where(
			and(lte(planItems.date, toIso), or(gte(planItems.date, fromIso), gte(planItems.endDate, fromIso)))
		)
		.orderBy(asc(planItems.date), asc(planItems.sortOrder));
	const ids = rows.map((r) => r.id);
	const [tagsByItem, membersByItem] = await Promise.all([
		getTagsForEntities('plan_item', ids),
		getMembersForItems(ids)
	]);
	return rows.map((item) => ({
		...item,
		members: membersByItem[item.id] ?? [],
		tags: tagsByItem[item.id] ?? []
	}));
}

/** Group any dated records into a Map<isoDate, T[]> covering the whole span. */
export function byDay<T extends { date?: string; dueDate?: string; endDate?: string | null }>(
	fromIso: string,
	toIso: string,
	items: T[]
): Map<string, T[]> {
	const map = new Map<string, T[]>(spanDays(fromIso, toIso).map((d) => [d, []]));
	for (const it of items) {
		const start = it.date ?? it.dueDate;
		if (!start) continue;
		const end = it.endDate ?? start;
		for (const d of spanDays(start, end)) {
			if (map.has(d)) map.get(d)!.push(it);
		}
	}
	return map;
}
