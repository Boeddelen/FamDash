import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { rewardRedemptions } from '$lib/server/db/schema';
import { getPointsSummaryFor } from '$lib/server/chores/points';
import { guardAdmin, json } from '$lib/server/http';
import type { RequestHandler } from './$types';

/**
 * Roll a redemption back — a reward spun or picked by mistake, or one the family
 * decided not to honour after all. Admin-only: redeeming is open to everyone (the
 * balance check is what guards it), but *un*-spending points is a parent's call.
 *
 * The points return to the bank for free, with no compensating entry: a balance is
 * `earned - sum(redemptions)` (see chores/points.ts), so removing the row is the whole
 * refund. The saldo is immediately spendable again.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);

	const row = await db
		.select()
		.from(rewardRedemptions)
		.where(eq(rewardRedemptions.id, params.id))
		.get();
	if (!row) throw error(404, 'Redemption not found');

	await db.delete(rewardRedemptions).where(eq(rewardRedemptions.id, params.id));

	const summary = await getPointsSummaryFor(row.memberId);
	return json({ ok: true, refunded: row.pointsCost, balance: summary.balance });
};
