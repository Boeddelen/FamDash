import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { members } from '$lib/server/db/schema';
import { choresInRange, eventsInRange, planItemsInRange } from '$lib/server/agenda';
import { listTags } from '$lib/server/tags';
import { addDays, isoDate } from '$lib/server/date';
import type { PageServerLoad } from './$types';

/**
 * A rolling seven days starting with today, rather than a Monday–Sunday calendar week.
 * Since the day columns wrap on a phone or tablet, a calendar week would bury today
 * (and everything still to come) below days that have already been and gone — so today
 * leads, and tomorrow onwards follows it. `?w=n` shifts the window by whole weeks.
 *
 * Note this is only how the planner is *displayed*: chore points still score the
 * calendar week (see chores/+page.server.ts) so they reset predictably on Mondays.
 */
export const load: PageServerLoad = async ({ url }) => {
	const offset = Number(url.searchParams.get('w') ?? 0);
	const start = addDays(new Date(), offset * 7);
	const days = Array.from({ length: 7 }, (_, i) => isoDate(addDays(start, i)));
	const from = days[0];
	const to = days[6];

	const [events, chores, plans, allTags, memberList] = await Promise.all([
		eventsInRange(from, to),
		choresInRange(from, to),
		planItemsInRange(from, to),
		listTags(),
		db.select().from(members).orderBy(asc(members.sortOrder))
	]);

	return {
		offset,
		days,
		events,
		chores,
		plans,
		allTags,
		members: memberList.map((m) => ({ id: m.id, name: m.name, emoji: m.emoji, color: m.color })),
		today: isoDate(new Date())
	};
};
