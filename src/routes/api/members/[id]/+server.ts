import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { members } from '$lib/server/db/schema';
import { hashSecret } from '$lib/server/auth';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const patchSchema = z.object({
	name: z.string().min(1).max(60).optional(),
	role: z.enum(['adult', 'child']).optional(),
	emoji: z.string().min(1).max(8).optional(),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.optional(),
	sortOrder: z.number().int().optional(),
	/** "" clears the PIN, "1234".."12345678" sets it, undefined leaves it. */
	pin: z.string().regex(/^(\d{4,8})?$/).optional()
});

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const data = await body(request, patchSchema);
	const patch: Record<string, unknown> = {};
	for (const k of ['name', 'role', 'emoji', 'color', 'sortOrder'] as const) {
		if (data[k] !== undefined) patch[k] = data[k];
	}
	if (data.pin !== undefined) patch.pinHash = data.pin === '' ? null : await hashSecret(data.pin);

	const row = await db
		.update(members)
		.set(patch)
		.where(eq(members.id, params.id))
		.returning()
		.get();
	if (!row) throw error(404, 'Member not found');
	return json({ ...row, pinHash: undefined, hasPin: Boolean(row.pinHash) });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	await db.delete(members).where(eq(members.id, params.id));
	return json({ ok: true });
};
