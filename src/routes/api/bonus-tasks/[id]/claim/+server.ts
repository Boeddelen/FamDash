import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bonusClaims, bonusTasks } from '$lib/server/db/schema';
import { getPointsSummaryFor } from '$lib/server/chores/points';
import { todayIso } from '$lib/server/date';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	memberId: z.string().min(1),
	note: z.string().trim().max(200).optional()
});

/**
 * Claim a bonus task for a child: the points land immediately, same trust model as
 * ticking a chore off — no admin needed. An admin who disagrees deletes the claim
 * (DELETE /api/bonus-claims/[id]), which takes the points straight back out.
 *
 * Deliberately repeatable: a bonus task is a standing offer ("wash the car, +15p"),
 * not a one-shot, so there's no already-claimed check here.
 */
export const POST: RequestHandler = async ({ request, params }) => {
	const { memberId, note } = await body(request, schema);

	const task = await db.select().from(bonusTasks).where(eq(bonusTasks.id, params.id)).get();
	if (!task) throw error(404, 'Bonus task not found');
	if (!task.active) throw error(400, 'That bonus task is paused');

	const claim = await db
		.insert(bonusClaims)
		.values({
			bonusTaskId: task.id,
			memberId,
			// Snapshotted, so editing or deleting the card later can't rewrite history.
			title: task.title,
			emoji: task.emoji,
			points: task.points,
			note: note || null,
			claimedOn: todayIso()
		})
		.returning()
		.get();

	const summary = await getPointsSummaryFor(memberId);
	return json({ claim, balance: summary.balance });
};
