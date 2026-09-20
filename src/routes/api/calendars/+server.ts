import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarConnections } from '$lib/server/db/schema';
import { encryptJSON } from '$lib/server/crypto';
import { body, guardAdmin, json, z } from '$lib/server/http';
import { setSetting } from '$lib/server/settings';
import { googleAuthUrl } from '$lib/server/calendar/google';
import { getPublicOrigin } from '$lib/server/origin';
import { ICLOUD_CALDAV_URL } from '$lib/server/calendar/types';
import { syncConnection } from '$lib/server/calendar/sync';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	guardAdmin(locals);
	const rows = await db
		.select()
		.from(calendarConnections)
		.orderBy(asc(calendarConnections.createdAt));
	return json(
		rows.map((r) => ({
			id: r.id,
			kind: r.kind,
			label: r.label,
			color: r.color,
			enabled: r.enabled,
			writable: r.writable,
			config: r.config,
			lastSyncAt: r.lastSyncAt,
			lastError: r.lastError
		}))
	);
};

const schema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('caldav'),
		label: z.string().min(1).max(80),
		serverUrl: z.string().url().default(ICLOUD_CALDAV_URL),
		username: z.string().min(1),
		password: z.string().min(1),
		color: z
			.string()
			.regex(/^#[0-9a-fA-F]{6}$/)
			.default('#0ea5e9')
	}),
	z.object({
		kind: z.literal('ics_sub'),
		label: z.string().min(1).max(80),
		url: z.string().url(),
		color: z
			.string()
			.regex(/^#[0-9a-fA-F]{6}$/)
			.default('#0ea5e9')
	}),
	z.object({
		kind: z.literal('google'),
		label: z.string().min(1).max(80),
		clientId: z.string().min(1),
		clientSecret: z.string().min(1),
		color: z
			.string()
			.regex(/^#[0-9a-fA-F]{6}$/)
			.default('#0ea5e9')
	})
]);

export const POST: RequestHandler = async ({ request, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);

	if (data.kind === 'google') {
		// Defer creation until the OAuth callback returns with a refresh token.
		const state = crypto.randomUUID();
		const redirectUri = `${getPublicOrigin(request)}/api/calendars/google/callback`;
		await setSetting(`google_oauth:${state}`, {
			clientId: data.clientId,
			clientSecret: data.clientSecret,
			label: data.label,
			color: data.color,
			createdAt: Date.now()
		});
		return json({ authUrl: googleAuthUrl(data.clientId, redirectUri, state) });
	}

	const credentials =
		data.kind === 'caldav'
			? { serverUrl: data.serverUrl, username: data.username, password: data.password }
			: { url: data.url };

	const row = await db
		.insert(calendarConnections)
		.values({
			kind: data.kind,
			label: data.label,
			color: data.color,
			encCredentials: encryptJSON(credentials),
			writable: data.kind === 'caldav',
			config: {}
		})
		.returning()
		.get();

	syncConnection(row.id).catch(() => {});
	return json({ id: row.id });
};
