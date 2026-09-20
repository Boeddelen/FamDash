import { byDay, choresInRange, eventsInRange, planItemsInRange } from '$lib/server/agenda';
import { isoDate, monthGrid } from '$lib/server/date';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const now = new Date();
	const year = Number(url.searchParams.get('y') ?? now.getFullYear());
	const month = Number(url.searchParams.get('m') ?? now.getMonth()); // 0-based
	const anchor = new Date(year, month, 1);
	const grid = monthGrid(anchor);
	const from = grid[0][0];
	const to = grid[grid.length - 1][6];

	const [events, chores, plans] = await Promise.all([
		eventsInRange(from, to),
		choresInRange(from, to),
		planItemsInRange(from, to)
	]);

	const eventsByDay = byDay(from, to, events);
	const choresByDay = byDay(from, to, chores);
	const plansByDay = byDay(from, to, plans);

	const cells = grid.flat().map((date) => ({
		date,
		inMonth: new Date(date).getMonth() === month,
		events: eventsByDay.get(date) ?? [],
		chores: choresByDay.get(date) ?? [],
		plans: plansByDay.get(date) ?? []
	}));

	return {
		year,
		month,
		monthLabel: anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
		cells,
		today: isoDate(now)
	};
};
