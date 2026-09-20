import { error } from '@sveltejs/kit';
import { syncConnection } from '$lib/server/calendar/sync';
import { guardAdmin, json } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	try {
		const count = await syncConnection(params.id);
		return json({ ok: true, events: count });
	} catch (err) {
		throw error(502, err instanceof Error ? err.message : 'Sync failed');
	}
};
