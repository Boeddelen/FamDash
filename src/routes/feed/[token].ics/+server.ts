import { error } from '@sveltejs/kit';
import { getHousehold } from '$lib/server/settings';
import { buildFeed } from '$lib/server/calendar/feed';
import { secretsMatch } from '$lib/server/crypto';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const house = await getHousehold();
	if (!house.feedToken || !secretsMatch(params.token, house.feedToken)) throw error(404, 'Not found');

	const ics = await buildFeed();
	return new Response(ics, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'cache-control': 'max-age=900',
			'content-disposition': 'inline; filename="family-dashboard.ics"'
		}
	});
};
