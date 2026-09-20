import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { admins } from '$lib/server/db/schema';
import { createAdmin } from '$lib/server/auth';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	guardAdmin(locals);
	const rows = await db
		.select({ id: admins.id, name: admins.name, email: admins.email, createdAt: admins.createdAt })
		.from(admins)
		.orderBy(asc(admins.createdAt));
	return json(rows);
};

const schema = z.object({
	name: z.string().min(1).max(60),
	email: z.string().email(),
	password: z.string().min(8).max(200)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	const row = await createAdmin(data.name, data.email, data.password).catch(() => null);
	if (!row) return json({ message: 'That email is already registered' }, { status: 409 });
	return json({ id: row.id, name: row.name, email: row.email });
};
