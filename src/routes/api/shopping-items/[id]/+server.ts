import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shoppingItems } from '$lib/server/db/schema';
import { body, json, z } from '$lib/server/http';
import { UNITS } from '$lib/units';
import type { RequestHandler } from './$types';

/** The row's own fields. Picture and framing live on the product (see
 *  api/shopping-products/[id]), not here. */
const schema = z.object({
	listId: z.string().min(1).optional(),
	title: z.string().trim().min(1).max(80).optional(),
	amount: z.number().positive().max(100_000).nullable().optional(),
	unit: z.enum(UNITS).optional(),
	unitLabel: z.string().trim().max(24).nullable().optional(),
	note: z.string().trim().max(300).nullable().optional(),
	done: z.boolean().optional()
});

export const PATCH: RequestHandler = async ({ request, params }) => {
	const data = await body(request, schema);
	if (Object.keys(data).length === 0) throw error(400, 'Nothing to update');
	const row = await db
		.update(shoppingItems)
		.set(data)
		.where(eq(shoppingItems.id, params.id))
		.returning()
		.get();
	if (!row) throw error(404, 'Item not found');
	return json(row);
};

/** Taking a row off the list does *not* touch its product — that's what makes the
 *  list clearable without losing the picture and the category next week. */
export const DELETE: RequestHandler = async ({ params }) => {
	await db.delete(shoppingItems).where(eq(shoppingItems.id, params.id));
	return json({ ok: true });
};
