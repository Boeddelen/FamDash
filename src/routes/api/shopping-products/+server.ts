import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shoppingProducts } from '$lib/server/db/schema';
import { json } from '$lib/server/http';
import type { RequestHandler } from './$types';

/** The suggestion pool. Most-bought first, then most-recent — what you reach for often
 *  should be the first thing offered after two letters. */
export const GET: RequestHandler = async () => {
	return json(
		await db
			.select()
			.from(shoppingProducts)
			.orderBy(desc(shoppingProducts.timesUsed), desc(shoppingProducts.lastUsedAt))
	);
};
