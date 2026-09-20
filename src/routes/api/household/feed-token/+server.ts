import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { household } from '$lib/server/db/schema';
import { guardAdmin, json } from '$lib/server/http';
import type { RequestHandler } from './$types';

/** Rotate the published-feed secret — invalidates any leaked .ics URL immediately. */
export const POST: RequestHandler = async ({ locals }) => {
	guardAdmin(locals);
	const row = await db
		.update(household)
		.set({ feedToken: crypto.randomUUID() })
		.where(eq(household.id, 'singleton'))
		.returning({ feedToken: household.feedToken })
		.get();
	return json({ feedToken: row.feedToken });
};
