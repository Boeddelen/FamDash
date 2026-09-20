import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { consequenceDraws } from '$lib/server/db/schema';
import { guardAdmin, json } from '$lib/server/http';
import type { RequestHandler } from './$types';

/**
 * Undo a dealt consequence. The twin of rolling a reward redemption back — rewards and
 * consequences keep the same anatomy, so an "undo" on one side has to exist on the
 * other. No points are involved here: a consequence costs nothing, so removing the row
 * is simply forgetting it happened.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);

	const row = await db.select().from(consequenceDraws).where(eq(consequenceDraws.id, params.id)).get();
	if (!row) throw error(404, 'Draw not found');

	await db.delete(consequenceDraws).where(eq(consequenceDraws.id, params.id));
	return json({ ok: true });
};
