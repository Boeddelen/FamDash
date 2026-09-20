import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { shoppingProducts } from './db/schema';

/**
 * Find the remembered product for a typed name, or start remembering it.
 *
 * Matching is case-insensitive, because "havregryn" typed in a hurry and "Havregryn"
 * picked from the suggestions are the same thing — and a second product with the same
 * name would quietly split a picture away from half its purchases. The unique index is
 * `COLLATE NOCASE` for the same reason, so this can't race into a duplicate either.
 */
export async function resolveProduct(
	name: string,
	listId: string | null
): Promise<{ id: string; listId: string | null; unit: string; unitLabel: string | null }> {
	const trimmed = name.trim();
	const existing = await db
		.select()
		.from(shoppingProducts)
		.where(sql`lower(${shoppingProducts.name}) = lower(${trimmed})`)
		.get();

	if (existing) {
		// Remember the category it was last filed under, and bump it up the suggestions.
		await db
			.update(shoppingProducts)
			.set({
				listId: listId ?? existing.listId,
				timesUsed: existing.timesUsed + 1,
				lastUsedAt: Math.floor(Date.now() / 1000)
			})
			.where(eq(shoppingProducts.id, existing.id));
		return {
			id: existing.id,
			listId: listId ?? existing.listId,
			unit: existing.unit,
			unitLabel: existing.unitLabel
		};
	}

	const row = await db
		.insert(shoppingProducts)
		.values({ name: trimmed, listId, timesUsed: 1, lastUsedAt: Math.floor(Date.now() / 1000) })
		.returning()
		.get();
	return { id: row.id, listId: row.listId, unit: row.unit, unitLabel: row.unitLabel };
}
