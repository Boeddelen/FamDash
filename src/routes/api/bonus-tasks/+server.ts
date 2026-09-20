import { asc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bonusTasks } from '$lib/server/db/schema';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await db.select().from(bonusTasks).orderBy(asc(bonusTasks.sortOrder)));
};

const schema = z.object({
	title: z.string().trim().min(1).max(80),
	notes: z.string().trim().max(400).nullable().default(null),
	points: z.number().int().min(1).max(1000),
	emoji: z.string().min(1).max(8).default('⭐'),
	active: z.boolean().default(true)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	// New cards go on the end of the deck, same as a new member (see api/members).
	const { count } = (await db
		.select({ count: sql<number>`count(*)` })
		.from(bonusTasks)
		.get()) ?? { count: 0 };
	const row = await db
		.insert(bonusTasks)
		.values({ ...data, sortOrder: Number(count) || 0 })
		.returning()
		.get();
	return json(row);
};
