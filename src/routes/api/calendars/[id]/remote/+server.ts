import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarConnections } from '$lib/server/db/schema';
import { decryptJSON } from '$lib/server/crypto';
import { listRemoteCalendars } from '$lib/server/calendar/caldav';
import { guardAdmin, json } from '$lib/server/http';
import type { RequestHandler } from './$types';

/** List the calendars available on a CalDAV/Google connection, for the enable/write picker. */
export const GET: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	const conn = await db
		.select()
		.from(calendarConnections)
		.where(eq(calendarConnections.id, params.id))
		.get();
	if (!conn) throw error(404, 'Connection not found');
	if (conn.kind === 'ics_sub') return json([]);

	try {
		const cred = decryptJSON(conn.encCredentials);
		const cals = await listRemoteCalendars(conn.kind as 'caldav' | 'google', cred as never);
		return json(cals);
	} catch (err) {
		throw error(502, err instanceof Error ? err.message : 'Could not reach calendar server');
	}
};
