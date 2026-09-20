import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarConnections } from '$lib/server/db/schema';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	label: z.string().min(1).max(80).optional(),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.optional(),
	enabled: z.boolean().optional(),
	writable: z.boolean().optional(),
	config: z
		.object({
			calendars: z.array(z.string()).optional(),
			writeTarget: z.string().optional()
		})
		.optional()
});

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	const row = await db
		.update(calendarConnections)
		.set(data)
		.where(eq(calendarConnections.id, params.id))
		.returning()
		.get();
	if (!row) throw error(404, 'Connection not found');
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	await db.delete(calendarConnections).where(eq(calendarConnections.id, params.id));
	return json({ ok: true });
};
