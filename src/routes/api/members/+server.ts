import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { members } from '$lib/server/db/schema';
import { hashSecret } from '$lib/server/auth';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const rows = await db.select().from(members).orderBy(asc(members.sortOrder));
	return json(rows.map((m) => ({ ...m, pinHash: undefined, hasPin: Boolean(m.pinHash) })));
};

const createSchema = z.object({
	name: z.string().min(1).max(60),
	role: z.enum(['adult', 'child']).default('child'),
	emoji: z.string().min(1).max(8).default('🙂'),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.default('#4f46e5'),
	pin: z.string().regex(/^\d{4,8}$/).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	guardAdmin(locals);
	const data = await body(request, createSchema);
	const count = (await db.select().from(members)).length;
	const row = await db
		.insert(members)
		.values({
			name: data.name,
			role: data.role,
			emoji: data.emoji,
			color: data.color,
			pinHash: data.pin ? await hashSecret(data.pin) : null,
			sortOrder: count
		})
		.returning()
		.get();
	return json({ ...row, pinHash: undefined, hasPin: Boolean(row.pinHash) });
};
