import { createDAVClient, type DAVCalendar } from 'tsdav';
import {
	GOOGLE_CALDAV_URL,
	GOOGLE_TOKEN_URL,
	type CalDavCredentials,
	type GoogleCredentials,
	type NormalizedEvent,
	type RemoteCalendar
} from './types';
import { parseICalToEvents } from './parse';

type DavClient = Awaited<ReturnType<typeof createDAVClient>>;

async function caldavClient(cred: CalDavCredentials): Promise<DavClient> {
	return createDAVClient({
		serverUrl: cred.serverUrl,
		credentials: { username: cred.username, password: cred.password },
		authMethod: 'Basic',
		defaultAccountType: 'caldav'
	});
}

async function googleClient(cred: GoogleCredentials): Promise<DavClient> {
	return createDAVClient({
		serverUrl: GOOGLE_CALDAV_URL,
		credentials: {
			tokenUrl: GOOGLE_TOKEN_URL,
			refreshToken: cred.refreshToken,
			clientId: cred.clientId,
			clientSecret: cred.clientSecret
		},
		authMethod: 'Oauth',
		defaultAccountType: 'caldav'
	});
}

export async function davClientFor(
	kind: 'caldav' | 'google',
	cred: CalDavCredentials | GoogleCredentials
): Promise<DavClient> {
	return kind === 'google'
		? googleClient(cred as GoogleCredentials)
		: caldavClient(cred as CalDavCredentials);
}

export async function listRemoteCalendars(
	kind: 'caldav' | 'google',
	cred: CalDavCredentials | GoogleCredentials
): Promise<RemoteCalendar[]> {
	const client = await davClientFor(kind, cred);
	const calendars = await client.fetchCalendars();
	return calendars
		.filter((c) => (c.components ?? ['VEVENT']).includes('VEVENT'))
		.map((c) => ({
			url: c.url,
			displayName: typeof c.displayName === 'string' ? c.displayName : c.url,
			color: c.calendarColor
		}));
}

export async function fetchDavEvents(
	kind: 'caldav' | 'google',
	cred: CalDavCredentials | GoogleCredentials,
	enabledUrls: string[],
	from: Date,
	to: Date
): Promise<NormalizedEvent[]> {
	const client = await davClientFor(kind, cred);
	const calendars = await client.fetchCalendars();
	const wanted = calendars.filter(
		(c) => enabledUrls.length === 0 || enabledUrls.includes(c.url)
	);

	const range = {
		start: from.toISOString().replace(/\.\d{3}Z$/, 'Z'),
		end: to.toISOString().replace(/\.\d{3}Z$/, 'Z')
	};

	const all: NormalizedEvent[] = [];
	for (const calendar of wanted) {
		const objects = await client.fetchCalendarObjects({
			calendar: calendar as DAVCalendar,
			timeRange: range
		});
		const strings = objects.map((o) => o.data).filter((d): d is string => typeof d === 'string');
		all.push(...parseICalToEvents(strings, from, to));
	}
	return all;
}

export async function createDavEvent(
	kind: 'caldav' | 'google',
	cred: CalDavCredentials | GoogleCredentials,
	targetCalendarUrl: string | undefined,
	iCalString: string,
	uid: string
): Promise<void> {
	const client = await davClientFor(kind, cred);
	const calendars = await client.fetchCalendars();
	const target =
		calendars.find((c) => c.url === targetCalendarUrl) ??
		calendars.find((c) => (c.components ?? ['VEVENT']).includes('VEVENT'));
	if (!target) throw new Error('No writable calendar found on this connection');

	await client.createCalendarObject({
		calendar: target as DAVCalendar,
		filename: `${uid}.ics`,
		iCalString
	});
}
