import { eq } from 'drizzle-orm';
import { db } from '../db';
import { calendarConnections, calendarEvents } from '../db/schema';
import { decryptJSON } from '../crypto';
import { addDays } from '../date';
import { fetchDavEvents, createDavEvent } from './caldav';
import { parseICalToEvents } from './parse';
import type {
	CalDavCredentials,
	ConnectionConfig,
	GoogleCredentials,
	IcsCredentials,
	NormalizedEvent
} from './types';

const SYNC_BACK = 30;
const SYNC_FWD = 180;

async function fetchIcsEvents(url: string, from: Date, to: Date): Promise<NormalizedEvent[]> {
	const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`ICS ${res.status}`);
	return parseICalToEvents([await res.text()], from, to);
}

export async function syncConnection(connectionId: string): Promise<number> {
	const conn = await db
		.select()
		.from(calendarConnections)
		.where(eq(calendarConnections.id, connectionId))
		.get();
	if (!conn || !conn.enabled) return 0;

	const from = addDays(new Date(), -SYNC_BACK);
	const to = addDays(new Date(), SYNC_FWD);
	const cfg = (conn.config ?? {}) as ConnectionConfig;

	try {
		const cred = decryptJSON(conn.encCredentials);
		let events: NormalizedEvent[] = [];

		if (conn.kind === 'ics_sub') {
			events = await fetchIcsEvents((cred as IcsCredentials).url, from, to);
		} else {
			events = await fetchDavEvents(
				conn.kind as 'caldav' | 'google',
				cred as CalDavCredentials | GoogleCredentials,
				cfg.calendars ?? [],
				from,
				to
			);
		}

		await db.delete(calendarEvents).where(eq(calendarEvents.connectionId, connectionId));
		// Insert in chunks to stay under SQLite's variable limit.
		for (let i = 0; i < events.length; i += 200) {
			const chunk = events.slice(i, i + 200);
			await db
				.insert(calendarEvents)
				.values(
					chunk.map((e) => ({
						connectionId,
						uid: e.uid,
						title: e.title,
						start: e.start,
						end: e.end,
						allDay: e.allDay,
						location: e.location ?? null,
						description: e.description ?? null
					}))
				)
				.onConflictDoNothing();
		}

		await db
			.update(calendarConnections)
			.set({ lastSyncAt: Math.floor(Date.now() / 1000), lastError: null })
			.where(eq(calendarConnections.id, connectionId));
		return events.length;
	} catch (err) {
		await db
			.update(calendarConnections)
			.set({
				lastSyncAt: Math.floor(Date.now() / 1000),
				lastError: err instanceof Error ? err.message : String(err)
			})
			.where(eq(calendarConnections.id, connectionId));
		throw err;
	}
}

export async function syncAllCalendars(): Promise<void> {
	const conns = await db
		.select({ id: calendarConnections.id })
		.from(calendarConnections)
		.where(eq(calendarConnections.enabled, true));
	for (const c of conns) {
		try {
			await syncConnection(c.id);
		} catch (err) {
			console.error('[calendar-sync]', c.id, err instanceof Error ? err.message : err);
		}
	}
}

/** Minimal single-VEVENT iCal document. */
export function buildVEvent(opts: {
	uid: string;
	title: string;
	start: Date;
	end: Date;
	allDay: boolean;
	description?: string;
	location?: string;
}): string {
	const fmt = (d: Date) =>
		opts.allDay
			? d.toISOString().slice(0, 10).replace(/-/g, '')
			: d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
	const dt = opts.allDay ? ';VALUE=DATE' : '';
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Family Dashboard//EN',
		'BEGIN:VEVENT',
		`UID:${opts.uid}`,
		`DTSTAMP:${fmt(new Date())}`,
		`DTSTART${dt}:${fmt(opts.start)}`,
		`DTEND${dt}:${fmt(opts.end)}`,
		`SUMMARY:${escapeText(opts.title)}`,
		opts.location ? `LOCATION:${escapeText(opts.location)}` : '',
		opts.description ? `DESCRIPTION:${escapeText(opts.description)}` : '',
		'END:VEVENT',
		'END:VCALENDAR'
	]
		.filter(Boolean)
		.join('\r\n');
}

function escapeText(s: string): string {
	return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}

/** Push a single event into a writable CalDAV/Google connection. Returns its UID. */
export async function writeEventToConnection(
	connectionId: string,
	event: { title: string; start: Date; end: Date; allDay: boolean; description?: string; location?: string }
): Promise<string> {
	const conn = await db
		.select()
		.from(calendarConnections)
		.where(eq(calendarConnections.id, connectionId))
		.get();
	if (!conn) throw new Error('connection not found');
	if (conn.kind === 'ics_sub') throw new Error('cannot write to a subscription calendar');

	const cred = decryptJSON(conn.encCredentials) as CalDavCredentials | GoogleCredentials;
	const cfg = (conn.config ?? {}) as ConnectionConfig;
	const uid = `fd-${crypto.randomUUID()}@family-dashboard`;
	const ics = buildVEvent({ uid, ...event });
	await createDavEvent(conn.kind as 'caldav' | 'google', cred, cfg.writeTarget, ics, uid);
	return uid;
}
