import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { documentGroups, schoolDocuments } from '$lib/server/db/schema';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const { name } = await body(request, z.object({ name: z.string().min(1).max(80) }));
	const row = await db
		.update(documentGroups)
		.set({ name })
		.where(eq(documentGroups.id, params.id))
		.returning()
		.get();
	if (!row) throw error(404, 'Box not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	// The documents outlive the box: they fall back to the unfiled pile so a mis-tap on
	// the delete button can't take a term's worth of weekly plans with it. The schema's
	// `on delete set null` says the same thing, but doing it explicitly keeps the
	// behaviour true even if foreign keys are off on the connection.
	await db
		.update(schoolDocuments)
		.set({ groupId: null })
		.where(eq(schoolDocuments.groupId, params.id));
	await db.delete(documentGroups).where(eq(documentGroups.id, params.id));
	return json({ ok: true });
};
