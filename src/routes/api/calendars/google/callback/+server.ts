import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { calendarConnections } from '$lib/server/db/schema';
import { encryptJSON } from '$lib/server/crypto';
import { getSetting, setSetting } from '$lib/server/settings';
import { exchangeGoogleCode } from '$lib/server/calendar/google';
import { getPublicOrigin } from '$lib/server/origin';
import { syncConnection } from '$lib/server/calendar/sync';
import type { RequestHandler } from './$types';

type Pending = { clientId: string; clientSecret: string; label: string; color: string };

export const GET: RequestHandler = async ({ url, locals, request }) => {
	// Only an admin can complete this flow.
	if (!locals.admin) throw redirect(303, '/settings?calendar=google_error');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code || !state) throw redirect(303, '/settings?calendar=google_error');

	const pending = await getSetting<Pending>(`google_oauth:${state}`);
	if (!pending) throw redirect(303, '/settings?calendar=google_expired');
	await setSetting(`google_oauth:${state}`, null);

	const redirectUri = `${getPublicOrigin(request)}/api/calendars/google/callback`;
	try {
		const { refreshToken } = await exchangeGoogleCode(
			pending.clientId,
			pending.clientSecret,
			code,
			redirectUri
		);
		const row = await db
			.insert(calendarConnections)
			.values({
				kind: 'google',
				label: pending.label,
				color: pending.color,
				encCredentials: encryptJSON({
					clientId: pending.clientId,
					clientSecret: pending.clientSecret,
					refreshToken
				}),
				writable: true,
				config: {}
			})
			.returning()
			.get();
		syncConnection(row.id).catch(() => {});
	} catch {
		throw redirect(303, '/settings?calendar=google_error');
	}

	throw redirect(303, '/settings?calendar=google_ok');
};
