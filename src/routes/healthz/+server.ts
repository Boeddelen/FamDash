import { sqlite } from '$lib/server/db';
import { json } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	let dbOk = false;
	try {
		sqlite.prepare('SELECT 1').get();
		dbOk = true;
	} catch {
		dbOk = false;
	}
	return json(
		{ status: dbOk ? 'ok' : 'degraded', db: dbOk, uptime: process.uptime() },
		{ status: dbOk ? 200 : 503 }
	);
};
