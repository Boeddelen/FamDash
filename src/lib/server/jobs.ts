import cron from 'node-cron';
import { building } from '$app/environment';

let started = false;

/**
 * Register in-process background jobs. Safe to call multiple times.
 * Individual jobs no-op until the household setup is complete.
 */
export function startJobs(): void {
	if (started || building) return;
	started = true;

	// Calendar sync — every 15 minutes.
	cron.schedule('*/15 * * * *', () => run('calendar-sync', () => syncAllCalendars()));
	// Weather refresh — every 30 minutes.
	cron.schedule('*/30 * * * *', () => run('weather', () => refreshWeather()));
	// Chore + recurring-notation instance generation, "on this day" facts, and nightly
	// backup — daily just after midnight.
	cron.schedule('5 0 * * *', () => run('chore-gen', () => regenerateChoreInstances()));
	cron.schedule('7 0 * * *', () => run('plan-series-gen', () => regeneratePlanSeries()));
	cron.schedule('10 0 * * *', () => run('on-this-day', () => refreshOnThisDay()));
	cron.schedule('15 0 * * *', () => run('backup', () => backupDatabase()));
	// Weekly plans are read Mon–Fri, so the school week's documents are archived at the
	// Saturday boundary. The job derives its cutoff from the calendar, so the boot-time
	// run below catches up a Saturday missed to downtime rather than skipping a week.
	cron.schedule('20 0 * * 6', () => run('doc-archive', () => archiveDueDocuments()));

	// Kick off an initial weather + on-this-day + calendar fetch shortly after boot.
	setTimeout(() => run('weather', () => refreshWeather()), 4000);
	setTimeout(() => run('on-this-day', () => refreshOnThisDay()), 6000);
	setTimeout(() => run('calendar-sync', () => syncAllCalendars()), 8000);
	setTimeout(() => run('doc-archive', () => archiveDueDocuments()), 10000);
}

async function run(name: string, fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (err) {
		console.error(`[job:${name}]`, err instanceof Error ? err.message : err);
	}
}

// Lazy imports keep this module cheap to load and avoid circular deps at boot.
async function syncAllCalendars() {
	const { syncAllCalendars } = await import('./calendar/sync');
	return syncAllCalendars();
}
async function refreshWeather() {
	const { refreshWeather } = await import('./weather');
	return refreshWeather();
}
async function regenerateChoreInstances() {
	const { regenerateAll } = await import('./chores/generate');
	return regenerateAll();
}
async function regeneratePlanSeries() {
	const { regenerateAllSeries } = await import('./plans/generate');
	return regenerateAllSeries();
}
async function backupDatabase() {
	const { backupDatabase } = await import('./backup');
	return backupDatabase();
}
async function archiveDueDocuments() {
	const { archiveDueDocuments } = await import('./school');
	return archiveDueDocuments();
}
async function refreshOnThisDay() {
	const { refreshOnThisDay } = await import('./onthisday');
	return refreshOnThisDay();
}
