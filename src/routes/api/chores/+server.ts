import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { chores } from '$lib/server/db/schema';
import { regenerateChore } from '$lib/server/chores/generate';
import { setEntityTags } from '$lib/server/tags';
import { CHORE_CATEGORY_KEYS } from '$lib/categories';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await db.select().from(chores).orderBy(asc(chores.title)));
};

const schema = z.object({
	title: z.string().min(1).max(120),
	notes: z.string().max(500).nullish(),
	assignedMemberId: z.string().nullish(),
	recurrence: z.enum(['none', 'daily', 'weekly', 'weekdays', 'custom']).default('none'),
	weekdayMask: z.number().int().min(0).max(127).default(0),
	startDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullish(),
	time: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.nullish(),
	category: z.enum(CHORE_CATEGORY_KEYS).nullish(),
	checklist: z.array(z.string().trim().min(1).max(160)).max(20).nullish(),
	tagIds: z.array(z.string()).max(20).default([]),
	points: z.number().int().min(0).max(100).default(1),
	active: z.boolean().default(true)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	const row = await db
		.insert(chores)
		.values({
			title: data.title,
			notes: data.notes ?? null,
			assignedMemberId: data.assignedMemberId ?? null,
			recurrence: data.recurrence,
			weekdayMask: data.weekdayMask,
			startDate: data.startDate ?? null,
			time: data.time ?? null,
			category: data.category ?? null,
			checklist: data.checklist?.length ? data.checklist : null,
			points: data.points,
			active: data.active
		})
		.returning()
		.get();
	await setEntityTags('chore', row.id, data.tagIds);
	await regenerateChore(row.id);
	return json(row);
};
