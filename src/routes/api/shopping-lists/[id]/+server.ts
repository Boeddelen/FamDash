import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shoppingLists, shoppingItems } from '$lib/server/db/schema';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	name: z.string().trim().min(1).max(60).optional(),
	emoji: z.string().trim().min(1).max(8).optional()
});

export const PATCH: RequestHandler = async ({ request, params }) => {
	const data = await body(request, schema);
	if (Object.keys(data).length === 0) throw error(400, 'Nothing to update');
	const row = await db
		.update(shoppingLists)
		.set(data)
		.where(eq(shoppingLists.id, params.id))
		.returning()
		.get();
	if (!row) throw error(404, 'Category not found');
	return json(row);
};

/**
 * Deleting a list deletes the items on it. That's a change from when these were
 * "categories" and their contents fell back to an "other" pile — there is no such pile
 * any more, so orphaning them would make them invisible, which is worse than removing
 * them. The dialog says how many are going. The *products* behind them are untouched,
 * so nothing is forgotten: everything can be put back on a new list from the register.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	await db.delete(shoppingItems).where(eq(shoppingItems.listId, params.id));
	await db.delete(shoppingLists).where(eq(shoppingLists.id, params.id));
	return json({ ok: true });
};
