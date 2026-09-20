import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { consequences } from '$lib/server/db/schema';
import { DURATION_UNITS } from '$lib/duration';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	title: z.string().trim().min(1).max(80).optional(),
	emoji: z.string().min(1).max(8).optional(),
	weight: z.number().int().min(1).max(100).optional(),
	durationValue: z.number().int().min(1).max(1000).nullable().optional(),
	durationUnit: z.enum(DURATION_UNITS).nullable().optional(),
	active: z.boolean().optional()
});

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	const row = await db.update(consequences).set(data).where(eq(consequences.id, params.id)).returning().get();
	if (!row) throw error(404, 'Consequence not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	// Past draws keep their own title/emoji snapshot, so this is safe.
	await db.delete(consequences).where(eq(consequences.id, params.id));
	return json({ ok: true });
};
