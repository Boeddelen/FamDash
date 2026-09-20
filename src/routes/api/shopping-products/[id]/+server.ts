import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shoppingProducts } from '$lib/server/db/schema';
import { body, guardAdmin, json, z } from '$lib/server/http';
import { deleteShoppingImage } from '$lib/server/shoppingImages';
import { IMAGE_FITS, ZOOM_MAX, ZOOM_MIN } from '$lib/bonusImage';
import { UNITS } from '$lib/units';
import type { RequestHandler } from './$types';

/**
 * The register's master data. Admin-only: the list itself stays open to everyone, but
 * what a product *is* — its name, the unit it's measured in, what it costs — is curated,
 * so a mistyped price on the list can't rewrite the register for everybody.
 *
 * Framing is PATCHed on its own as the focal point is dragged, same as a bonus card.
 */
const schema = z.object({
	name: z.string().trim().min(1).max(80).optional(),
	listId: z.string().min(1).nullable().optional(),
	unit: z.enum(UNITS).optional(),
	unitLabel: z.string().trim().max(24).nullable().optional(),
	priceOre: z.number().int().min(0).max(10_000_000).nullable().optional(),
	store: z.string().trim().max(60).nullable().optional(),
	imageFit: z.enum(IMAGE_FITS).optional(),
	imageX: z.number().int().min(0).max(100).optional(),
	imageY: z.number().int().min(0).max(100).optional(),
	imageZoom: z.number().int().min(ZOOM_MIN).max(ZOOM_MAX).optional()
});

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	if (Object.keys(data).length === 0) throw error(400, 'Nothing to update');
	const row = await db
		.update(shoppingProducts)
		.set(data)
		.where(eq(shoppingProducts.id, params.id))
		.returning()
		.get();
	if (!row) throw error(404, 'Product not found');
	return json(row);
};

/** Forgetting a product drops it out of the suggestions and takes its picture with it.
 *  Rows already on the list keep working — they carry their own `title`. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	await deleteShoppingImage(params.id);
	await db.delete(shoppingProducts).where(eq(shoppingProducts.id, params.id));
	return json({ ok: true });
};
