import { asc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shoppingLists } from '$lib/server/db/schema';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

// Nothing here is admin-gated. A shopping list everyone can't write to is a shopping
// list nobody uses — the whole point is that whoever notices the milk is low adds it.

export const GET: RequestHandler = async () => {
	return json(
		await db.select().from(shoppingLists).orderBy(asc(shoppingLists.sortOrder), asc(shoppingLists.createdAt))
	);
};

const schema = z.object({
	name: z.string().trim().min(1).max(60),
	emoji: z.string().trim().min(1).max(8).default('🛒')
});

export const POST: RequestHandler = async ({ request }) => {
	const data = await body(request, schema);
	const { count } = (await db.select({ count: sql<number>`count(*)` }).from(shoppingLists).get()) ?? {
		count: 0
	};
	const row = await db
		.insert(shoppingLists)
		.values({ ...data, sortOrder: Number(count) || 0 })
		.returning()
		.get();
	return json(row);
};
