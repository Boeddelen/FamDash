import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { rewardRedemptions, rewards } from '$lib/server/db/schema';
import { getPointsSummaryFor } from '$lib/server/chores/points';
import { computeExpiresAt } from '$lib/duration';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({ memberId: z.string().min(1) });

/**
 * Redeem a specific reward for a child. Open to anyone, like the rewards bandit and
 * the consequences lever — the balance check below is what stops a child spending
 * points they haven't earned.
 */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	const { memberId } = await body(request, schema);

	const reward = await db.select().from(rewards).where(eq(rewards.id, params.id)).get();
	if (!reward) throw error(404, 'Reward not found');

	const summary = await getPointsSummaryFor(memberId);
	if (summary.balance < reward.pointsCost) {
		throw error(400, `Not enough points yet (${summary.balance}/${reward.pointsCost})`);
	}

	const redemption = await db
		.insert(rewardRedemptions)
		.values({
			rewardId: reward.id,
			memberId,
			title: reward.title,
			pointsCost: reward.pointsCost,
			expiresAt: computeExpiresAt(reward.durationValue, reward.durationUnit),
			// Only an admin *account* id belongs in this column (it's a foreign key); a
			// parent who elevated with their member PIN has no admin row.
			redeemedByAdminId: locals.admin?.kind === 'admin' ? locals.admin.id : null
		})
		.returning()
		.get();

	return json({ redemption, balance: summary.balance - reward.pointsCost });
};
