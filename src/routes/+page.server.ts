import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { members } from '$lib/server/db/schema';
import { choresInRange, eventsInRange, planItemsInRange } from '$lib/server/agenda';
import { getWeather } from '$lib/server/weather';
import { listSchoolDocuments } from '$lib/server/school';
import { getOnThisDay } from '$lib/server/onthisday';
import { getPointsSummary } from '$lib/server/chores/points';
import { addDays, isoDate, todayIso, weekDates } from '$lib/server/date';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const today = todayIso();
	const weekEnd = isoDate(addDays(new Date(), 7));
	const week = weekDates(new Date());

	const [weather, events, chores, plans, documents, onThisDay, memberList] = await Promise.all([
		getWeather(),
		eventsInRange(today, weekEnd),
		choresInRange(week[0], week[6]),
		planItemsInRange(today, weekEnd),
		listSchoolDocuments(),
		getOnThisDay(),
		db.select().from(members).orderBy(asc(members.sortOrder))
	]);

	// "Coming up" merges upcoming calendar events with upcoming (future-dated) to-dos,
	// so adding a to-do for a later day in Week/Month actually shows up here too.
	const upcoming = [
		...events
			.filter((e) => e.date > today)
			.map((e) => ({ kind: 'event' as const, date: e.date, title: e.title, color: e.color })),
		...plans
			.filter((p) => p.date > today)
			.map((p) => ({
				kind: 'plan' as const,
				date: p.date,
				title: p.title,
				emoji: p.members[0]?.emoji ?? null
			}))
	]
		.sort((a, b) => a.date.localeCompare(b.date))
		.slice(0, 6);

	// Per child, never mixed together: each child's own done/total/points this week.
	const weekChores = chores; // (rolling 7-day window fetched above)
	const counts = new Map<string, { done: number; total: number }>();
	for (const c of weekChores) {
		if (!c.memberId) continue;
		const e = counts.get(c.memberId) ?? { done: 0, total: 0 };
		e.total++;
		if (c.status === 'done') e.done++;
		counts.set(c.memberId, e);
	}
	const points = await getPointsSummary([...counts.keys()]);
	const weekByMember = [...counts.entries()]
		.map(([id, c]) => {
			const m = memberList.find((x) => x.id === id)!;
			return {
				member: { id: m.id, name: m.name, emoji: m.emoji, color: m.color, hasAvatar: Boolean(m.avatarPath) },
				points: points[id]?.week ?? 0,
				...c
			};
		})
		.sort((a, b) => b.points - a.points);

	return {
		today,
		week,
		weather,
		todayEvents: events.filter((e) => e.date === today || (e.endDate && e.date <= today && e.endDate >= today)),
		upcoming,
		todayChores: chores.filter((c) => c.dueDate === today),
		weekChores,
		weekByMember,
		// Includes multi-day notations that started earlier but are still ongoing today.
		todayPlans: plans.filter((p) => p.date <= today && (p.endDate ?? p.date) >= today),
		latestDoc: documents[0] ?? null,
		docCount: documents.length,
		onThisDay: onThisDay?.items ?? []
	};
};
