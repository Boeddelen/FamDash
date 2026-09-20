import { logoutAdmin } from '$lib/server/auth';
import { json } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	await logoutAdmin(cookies);
	return json({ ok: true });
};
