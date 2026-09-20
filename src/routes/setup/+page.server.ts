import { redirect } from '@sveltejs/kit';
import { getHousehold } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const house = await getHousehold();
	if (house.setupComplete) throw redirect(303, '/');
	return {
		guessTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
	};
};
