import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { chores } from '$lib/server/db/schema';
import { regenerateChore } from '$lib/server/chores/generate';
import { clearEntityTags, setEntityTags } from '$lib/server/tags';
import { CHORE_CATEGORY_KEYS } from '$lib/categories';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	title: z.string().min(1).max(120).optional(),
	notes: z.string().max(500).nullable().optional(),
	assignedMemberId: z.string().nullable().optional(),
	recurrence: z.enum(['none', 'daily', 'weekly', 'weekdays', 'custom']).optional(),
	weekdayMask: z.number().int().min(0).max(127).optional(),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.optional(),
	time: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.nullable()
		.optional(),
	category: z.enum(CHORE_CATEGORY_KEYS).nullable().optional(),
	checklist: z.array(z.string().trim().min(1).max(160)).max(20).nullable().optional(),
	tagIds: z.array(z.string()).max(20).optional(),
	points: z.number().int().min(0).max(100).optional(),
	active: z.boolean().optional()
});

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const { tagIds, ...data } = await body(request, schema);
	if (data.checklist && data.checklist.length === 0) data.checklist = null;
	const row = await db
		.update(chores)
		.set(data)
		.where(eq(chores.id, params.id))
		.returning()
		.get();
	if (!row) throw error(404, 'Chore not found');
	if (tagIds !== undefined) await setEntityTags('chore', row.id, tagIds);
	await regenerateChore(row.id);
	return json(row);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	await db.delete(chores).where(eq(chores.id, params.id));
	await clearEntityTags('chore', params.id);
	return json({ ok: true });
};
