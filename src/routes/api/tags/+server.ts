import { db } from '$lib/server/db';
import { tags } from '$lib/server/db/schema';
import { listTags } from '$lib/server/tags';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await listTags());
};

const schema = z.object({
	label: z.string().trim().min(1).max(30),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.default('#6b7280')
});

export const POST: RequestHandler = async ({ request, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	const row = await db.insert(tags).values(data).returning().get();
	return json(row);
};
