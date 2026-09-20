import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { members } from '$lib/server/db/schema';
import { getHousehold } from '$lib/server/settings';
import { getTodayProgress } from '$lib/server/chores/progress';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const house = await getHousehold();
	const memberList = house.setupComplete
		? await db.select().from(members).orderBy(asc(members.sortOrder), asc(members.createdAt))
		: [];

	// Every avatar in the app draws a "how far through today" ring, so the numbers are
	// resolved once here rather than threaded through each page's own load.
	const progress = await getTodayProgress(memberList.map((m) => m.id));

	return {
		household: {
			name: house.name,
			theme: house.theme,
			locale: (house.locale === 'en' ? 'en' : 'nb') as 'nb' | 'en',
			setupComplete: house.setupComplete
		},
		admin: locals.admin ? { name: locals.admin.name, email: locals.admin.email } : null,
		operator: locals.operator
			? {
					id: locals.operator.id,
					name: locals.operator.name,
					emoji: locals.operator.emoji,
					color: locals.operator.color,
					hasAvatar: Boolean(locals.operator.avatarPath)
				}
			: null,
		members: memberList.map((m) => ({
			id: m.id,
			name: m.name,
			emoji: m.emoji,
			color: m.color,
			role: m.role,
			hasPin: Boolean(m.pinHash),
			hasAvatar: Boolean(m.avatarPath)
		})),
		progress,
		path: url.pathname
	};
};
