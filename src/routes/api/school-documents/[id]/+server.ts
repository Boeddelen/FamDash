import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { schoolDocuments } from '$lib/server/db/schema';
import { body, guardAdmin, json, z } from '$lib/server/http';
import { deleteSchoolDocument } from '$lib/server/school';
import type { RequestHandler } from './$types';

/**
 * Renaming is open to everyone — a plan lands as "skann_0423.pdf" and whoever is standing
 * at the tablet should be able to call it "Uke 38 - Y2" there and then. Archiving is
 * admin-only, because pulling something back onto the board is a parent's call.
 */
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	const { title, archived } = await body(
		request,
		z.object({ title: z.string().min(1).max(160).optional(), archived: z.boolean().optional() })
	);
	if (title === undefined && archived === undefined) throw error(400, 'Nothing to update');
	if (archived !== undefined) guardAdmin(locals);

	const patch: { title?: string; archivedAt?: number | null; archiveExempt?: boolean } = {};
	if (title !== undefined) patch.title = title;
	if (archived !== undefined) {
		patch.archivedAt = archived ? Math.floor(Date.now() / 1000) : null;
		// Putting something back has to stick, or the next run of the archiving job
		// quietly reverses the parent who did it.
		patch.archiveExempt = !archived;
	}

	const row = await db
		.update(schoolDocuments)
		.set(patch)
		.where(eq(schoolDocuments.id, params.id))
		.returning()
		.get();
	if (!row) throw error(404, 'Document not found');
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	await deleteSchoolDocument(params.id);
	return json({ ok: true });
};
