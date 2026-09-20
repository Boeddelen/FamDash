import { asc, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shoppingLists, shoppingItems, shoppingProducts } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		// The register tab shows its edit controls only to an admin; the API enforces it.
		isAdmin: !!locals.admin,
		lists: await db
			.select()
			.from(shoppingLists)
			.orderBy(asc(shoppingLists.sortOrder), asc(shoppingLists.createdAt)),
		items: await db.select().from(shoppingItems).orderBy(asc(shoppingItems.sortOrder)),
		// The suggestion pool, most-bought first. A household's is small enough to ship
		// with the page and filter in the browser — that's what makes typing feel instant
		// rather than round-tripping per keystroke.
		products: await db
			.select()
			.from(shoppingProducts)
			.orderBy(desc(shoppingProducts.timesUsed), desc(shoppingProducts.lastUsedAt))
	};
};
