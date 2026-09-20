import { getSetting, setSetting } from './settings';
import { todayIso } from './date';

export type OnThisDayItem = {
	kind: 'event' | 'birth' | 'death';
	year: number | null;
	title: string;
	text: string;
};

export type OnThisDaySnapshot = {
	/** Calendar day (YYYY-MM-DD, local time) this pool of facts was fetched for. */
	date: string;
	fetchedAt: number;
	items: OnThisDayItem[];
};

// https://dayinhistory.dev/docs — free, no API key. Note: the docs page itself has a
// typo (shows api.dayinhistory.**com**); the real, working host is dayinhistory.**dev**.
const API_BASE = 'https://api.dayinhistory.dev/v1';
const MONTHS = [
	'january', 'february', 'march', 'april', 'may', 'june',
	'july', 'august', 'september', 'october', 'november', 'december'
];

type ApiListResponse<T> = { count: number; results: T[] };
type ApiEvent = { year?: string; title?: string; description?: string };
type ApiPerson = { name?: string; description?: string; bio?: string; birth_year?: string; death_year?: string };

async function fetchList<T>(path: string): Promise<T[]> {
	const res = await fetch(`${API_BASE}/${path}`, { signal: AbortSignal.timeout(15_000) });
	if (!res.ok) throw new Error(`dayinhistory.dev ${path} -> HTTP ${res.status}`);
	const data = (await res.json()) as ApiListResponse<T>;
	return Array.isArray(data.results) ? data.results : [];
}

function toYear(s: string | undefined): number | null {
	const n = Number(s);
	return s && Number.isFinite(n) ? n : null;
}

/** Fetch fresh events/births/deaths "on this day" from dayinhistory.dev and cache them. */
export async function refreshOnThisDay(): Promise<OnThisDaySnapshot> {
	const now = new Date();
	const month = MONTHS[now.getMonth()];
	const day = now.getDate();

	const [events, births, deaths] = await Promise.all([
		fetchList<ApiEvent>(`events/${month}/${day}/`),
		fetchList<ApiPerson>(`births/${month}/${day}/`),
		fetchList<ApiPerson>(`deaths/${month}/${day}/`)
	]);

	const items: OnThisDayItem[] = [
		...events.map((e) => ({
			kind: 'event' as const,
			year: toYear(e.year),
			title: (e.title ?? '').trim(),
			text: (e.description ?? '').trim()
		})),
		...births.map((p) => ({
			kind: 'birth' as const,
			year: toYear(p.birth_year),
			title: (p.name ?? '').trim(),
			text: (p.description ?? p.bio ?? '').trim()
		})),
		...deaths.map((p) => ({
			kind: 'death' as const,
			year: toYear(p.death_year),
			title: (p.name ?? '').trim(),
			text: (p.description ?? p.bio ?? '').trim()
		}))
	].filter((i) => i.title);

	const snapshot: OnThisDaySnapshot = {
		date: todayIso(),
		fetchedAt: Math.floor(Date.now() / 1000),
		items
	};
	await setSetting('onThisDay', snapshot);
	return snapshot;
}

/**
 * Cached "on this day" fact pool for today. The nightly job keeps this warm, but a
 * page load also self-heals: if the calendar day has rolled over and the cache is
 * stale (or empty, e.g. first run), it fetches fresh right here rather than showing
 * yesterday's facts or nothing until the next midnight job.
 */
export async function getOnThisDay(): Promise<OnThisDaySnapshot | null> {
	const cached = await getSetting<OnThisDaySnapshot>('onThisDay');
	if (cached && cached.date === todayIso()) return cached;
	try {
		return await refreshOnThisDay();
	} catch (err) {
		console.error('[onThisDay]', err instanceof Error ? err.message : err);
		return cached ?? null;
	}
}
