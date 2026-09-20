import { asc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shoppingItems } from '$lib/server/db/schema';
import { body, json, z } from '$lib/server/http';
import { resolveProduct } from '$lib/server/shopping';
import { UNITS } from '$lib/units';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await db.select().from(shoppingItems).orderBy(asc(shoppingItems.sortOrder)));
};

const schema = z.object({
	// Not nullable: every item is on a list, so there is never an "other" pile.
	listId: z.string().min(1),
	title: z.string().trim().min(1).max(80),
	amount: z.number().positive().max(100_000).nullable().default(null),
	unit: z.enum(UNITS).optional(),
	unitLabel: z.string().trim().max(24).nullable().default(null),
	note: z.string().trim().max(300).nullable().default(null)
});

export const POST: RequestHandler = async ({ request }) => {
	const data = await body(request, schema);
	// Every row on the list is an instance of a remembered product, whether it was
	// picked from the suggestions or typed out in full — so typing "havregryn" again
	// finds the same product, and its picture, as picking it would have.
	const product = await resolveProduct(data.title, data.listId);
	const { count } = (await db.select({ count: sql<number>`count(*)` }).from(shoppingItems).get()) ?? {
		count: 0
	};
	const row = await db
		.insert(shoppingItems)
		.values({
			...data,
			listId: product.listId,
			productId: product.id,
			// A new row starts in whatever unit the register says this product is
			// normally bought in, and is free to differ from there.
			unit: data.unit ?? product.unit,
			unitLabel: data.unit ? data.unitLabel : product.unitLabel,
			sortOrder: Number(count) || 0
		})
		.returning()
		.get();
	return json(row);
};
