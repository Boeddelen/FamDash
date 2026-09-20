import { db } from '$lib/server/db';
import { documentGroups } from '$lib/server/db/schema';
import { body, guardAdmin, json, z } from '$lib/server/http';
import { listDocumentGroups } from '$lib/server/school';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await listDocumentGroups());
};

export const POST: RequestHandler = async ({ request, locals }) => {
	guardAdmin(locals);
	const { name } = await body(request, z.object({ name: z.string().min(1).max(80) }));
	// New boxes go on the end. `sortOrder` is a plain counter rather than an index, so
	// two boxes created in the same second still land in a stable order.
	const existing = await listDocumentGroups();
	const row = await db
		.insert(documentGroups)
		.values({ name, sortOrder: existing.length })
		.returning()
		.get();
	return json(row);
};
