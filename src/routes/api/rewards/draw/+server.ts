import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { rewardRedemptions, rewards } from '$lib/server/db/schema';
import { getPointsSummaryFor } from '$lib/server/chores/points';
import { computeExpiresAt } from '$lib/duration';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({ memberId: z.string().min(1), note: z.string().trim().max(200).optional() });

/**
 * Pull the rewards bandit: picks a random *affordable* active reward, weighted by
 * `weight`, and redeems it — same points-deduction and history entry as a normal
 * manual redemption, just chosen for you. Open to anyone, mirroring the consequences
 * lever: a child spends their own points, and the balance check below is what stops
 * them spending points they haven't earned.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { memberId, note } = await body(request, schema);

	const summary = await getPointsSummaryFor(memberId);
	const catalog = await db.select().from(rewards).where(eq(rewards.active, true));
	const pool = catalog.filter((r) => r.pointsCost <= summary.balance);
	if (pool.length === 0) throw error(400, 'No reward affordable yet');

	const totalWeight = pool.reduce((sum, r) => sum + r.weight, 0);
	let roll = Math.random() * totalWeight;
	let chosen = pool[pool.length - 1];
	for (const r of pool) {
		roll -= r.weight;
		if (roll <= 0) {
			chosen = r;
			break;
		}
	}

	const redemption = await db
		.insert(rewardRedemptions)
		.values({
			rewardId: chosen.id,
			memberId,
			title: chosen.title,
			pointsCost: chosen.pointsCost,
			note: note || null,
			expiresAt: computeExpiresAt(chosen.durationValue, chosen.durationUnit),
			// Only set when the puller happens to be elevated as an admin *account*
			// (not a member-backed session) — most pulls are unauthenticated now.
			redeemedByAdminId: locals.admin?.kind === 'admin' ? locals.admin.id : null
		})
		.returning()
		.get();

	return json({ redemption, rewardId: chosen.id, balance: summary.balance - chosen.pointsCost });
};
