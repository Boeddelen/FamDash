import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { consequenceDraws, consequences } from '$lib/server/db/schema';
import { computeExpiresAt } from '$lib/duration';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({ memberId: z.string().min(1), note: z.string().trim().max(200).optional() });

/**
 * Pull the "one-armed bandit" lever: picks a random active consequence, weighted by
 * `weight`, and logs it. Deliberately not admin-gated — any user (i.e. the kid caught
 * breaking the rule) can pull it themselves. The pick happens server-side (not in the
 * client's animation) so whoever's watching the reel spin can't see or influence which
 * outcome is coming — the client just animates down to whatever id this returns.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { memberId, note } = await body(request, schema);

	const pool = await db.select().from(consequences).where(eq(consequences.active, true));
	if (pool.length === 0) throw error(400, 'No consequences defined yet');

	const totalWeight = pool.reduce((sum, c) => sum + c.weight, 0);
	let roll = Math.random() * totalWeight;
	let chosen = pool[pool.length - 1];
	for (const c of pool) {
		roll -= c.weight;
		if (roll <= 0) {
			chosen = c;
			break;
		}
	}

	const expiresAt = computeExpiresAt(chosen.durationValue, chosen.durationUnit);

	const draw = await db
		.insert(consequenceDraws)
		.values({
			consequenceId: chosen.id,
			memberId,
			title: chosen.title,
			emoji: chosen.emoji,
			note: note || null,
			expiresAt,
			// Only set when the puller happens to be elevated as an admin *account*
			// (not a member-backed session) — most pulls are unauthenticated now.
			dealtByAdminId: locals.admin?.kind === 'admin' ? locals.admin.id : null
		})
		.returning()
		.get();

	return json({ draw, consequenceId: chosen.id });
};
