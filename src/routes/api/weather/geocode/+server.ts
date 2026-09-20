import { error } from '@sveltejs/kit';
import { geocode } from '$lib/server/weather';
import { json } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim();
	if (!q || q.length < 2) throw error(400, 'query too short');
	const results = await geocode(q);
	return json(
		results.map((r) => ({
			label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
			lat: r.latitude,
			lon: r.longitude,
			timezone: r.timezone
		}))
	);
};
