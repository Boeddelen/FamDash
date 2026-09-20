import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { tags } from '$lib/server/db/schema';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	label: z.string().trim().min(1).max(30).optional(),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.optional()
});

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	const row = await db.update(tags).set(data).where(eq(tags.id, params.id)).returning().get();
	if (!row) throw error(404, 'Tag not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	// entity_tags rows cascade on delete.
	await db.delete(tags).where(eq(tags.id, params.id));
	return json({ ok: true });
};
