import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bonusTasks } from '$lib/server/db/schema';
import { deleteBonusImage } from '$lib/server/bonusImages';
import { IMAGE_FITS, ZOOM_MAX, ZOOM_MIN } from '$lib/bonusImage';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	title: z.string().trim().min(1).max(80).optional(),
	notes: z.string().trim().max(400).nullable().optional(),
	points: z.number().int().min(1).max(1000).optional(),
	emoji: z.string().min(1).max(8).optional(),
	// Framing is patched on its own as the parent drags the preview, so every field
	// here is independently optional.
	imageFit: z.enum(IMAGE_FITS).optional(),
	imageX: z.number().int().min(0).max(100).optional(),
	imageY: z.number().int().min(0).max(100).optional(),
	imageZoom: z.number().int().min(ZOOM_MIN).max(ZOOM_MAX).optional(),
	sortOrder: z.number().int().min(0).max(10_000).optional(),
	active: z.boolean().optional()
});

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	const row = await db.update(bonusTasks).set(data).where(eq(bonusTasks.id, params.id)).returning().get();
	if (!row) throw error(404, 'Bonus task not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	// Past claims keep their own title/emoji/points snapshot (and a nulled task id), so
	// deleting the card leaves every child's earned balance exactly as it was.
	await deleteBonusImage(params.id);
	await db.delete(bonusTasks).where(eq(bonusTasks.id, params.id));
	return json({ ok: true });
};
