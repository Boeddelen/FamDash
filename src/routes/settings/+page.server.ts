import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { admins, calendarConnections, members } from '$lib/server/db/schema';
import type { ConnectionConfig } from '$lib/server/calendar/types';
import { getHousehold } from '$lib/server/settings';
import { getPublicOrigin } from '$lib/server/origin';
import { listTags, type TagRef } from '$lib/server/tags';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, request }) => {
	const house = await getHousehold();
	const origin = getPublicOrigin(request);
	const base = {
		needsAdmin: !locals.admin,
		household: {
			name: house.name,
			timezone: house.timezone,
			theme: house.theme,
			locale: house.locale,
			weatherLabel: house.weatherLabel,
			weatherLat: house.weatherLat,
			weatherLon: house.weatherLon
		},
		feedUrl: house.feedToken ? `${origin}/feed/${house.feedToken}.ics` : null,
		calendarNotice: url.searchParams.get('calendar'),
		admins: [] as { id: string; name: string; email: string; hasPin: boolean }[],
		members: [] as (typeof members.$inferSelect & { hasPin: boolean; hasAvatar: boolean })[],
		allTags: [] as TagRef[],
		calendars: [] as {
			id: string;
			kind: string;
			label: string;
			color: string;
			enabled: boolean;
			writable: boolean;
			config: ConnectionConfig;
			lastSyncAt: number | null;
			lastError: string | null;
		}[]
	};
	if (!locals.admin) return base;

	base.admins = (
		await db
			.select({ id: admins.id, name: admins.name, email: admins.email, pinHash: admins.pinHash })
			.from(admins)
			.orderBy(asc(admins.createdAt))
	).map(({ pinHash, ...a }) => ({ ...a, hasPin: Boolean(pinHash) }));
	base.members = (await db.select().from(members).orderBy(asc(members.sortOrder))).map((m) => ({
		...m,
		pinHash: null,
		hasPin: Boolean(m.pinHash),
		hasAvatar: Boolean(m.avatarPath)
	}));
	base.allTags = await listTags();
	base.calendars = (
		await db
			.select({
				id: calendarConnections.id,
				kind: calendarConnections.kind,
				label: calendarConnections.label,
				color: calendarConnections.color,
				enabled: calendarConnections.enabled,
				writable: calendarConnections.writable,
				config: calendarConnections.config,
				lastSyncAt: calendarConnections.lastSyncAt,
				lastError: calendarConnections.lastError
			})
			.from(calendarConnections)
			.orderBy(asc(calendarConnections.createdAt))
	).map((c) => ({ ...c, config: (c.config ?? {}) as ConnectionConfig }));
	return base;
};
