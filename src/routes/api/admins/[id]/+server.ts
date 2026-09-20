import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { admins } from '$lib/server/db/schema';
import { hashSecret } from '$lib/server/auth';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	name: z.string().min(1).max(60).optional(),
	password: z.string().min(8).max(200).optional(),
	/** "" clears the PIN, a 6–10 digit string sets it, undefined leaves it. */
	pin: z.string().regex(/^(\d{6,10})?$/).optional()
});

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	const patch: Record<string, unknown> = {};
	if (data.name) patch.name = data.name;
	if (data.password) patch.passwordHash = await hashSecret(data.password);
	if (data.pin !== undefined) patch.pinHash = data.pin === '' ? null : await hashSecret(data.pin);
	const row = await db
		.update(admins)
		.set(patch)
		.where(eq(admins.id, params.id))
		.returning({ id: admins.id, name: admins.name, email: admins.email })
		.get();
	if (!row) throw error(404, 'Admin not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const me = guardAdmin(locals);
	const all = await db.select({ id: admins.id }).from(admins);
	if (all.length <= 1) throw error(409, 'Cannot delete the only admin');
	if (me.id === params.id) throw error(409, 'Sign in as another admin to remove this account');
	await db.delete(admins).where(eq(admins.id, params.id));
	return json({ ok: true });
};
