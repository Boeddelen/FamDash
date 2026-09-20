import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bonusClaims } from '$lib/server/db/schema';
import { getPointsSummaryFor } from '$lib/server/chores/points';
import { guardAdmin, json } from '$lib/server/http';
import type { RequestHandler } from './$types';

/**
 * Undo a bonus claim — the mirror of rolling a redemption back, and for the same
 * reason: claiming is open to everyone, taking points *away* again is a parent's call.
 * Deleting the row is the whole adjustment; nothing else stores the total.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);

	const row = await db.select().from(bonusClaims).where(eq(bonusClaims.id, params.id)).get();
	if (!row) throw error(404, 'Claim not found');

	await db.delete(bonusClaims).where(eq(bonusClaims.id, params.id));

	const summary = await getPointsSummaryFor(row.memberId);
	return json({ ok: true, removed: row.points, balance: summary.balance });
};
