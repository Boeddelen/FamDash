import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { rewards } from '$lib/server/db/schema';
import { setEntityTags } from '$lib/server/tags';
import { DURATION_UNITS } from '$lib/duration';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await db.select().from(rewards).orderBy(asc(rewards.pointsCost)));
};

const schema = z
	.object({
		title: z.string().trim().min(1).max(80),
		pointsCost: z.number().int().min(1).max(100_000),
		emoji: z.string().min(1).max(8).default('🎁'),
		weight: z.number().int().min(1).max(100).default(1),
		durationValue: z.number().int().min(1).max(1000).nullable().default(null),
		durationUnit: z.enum(DURATION_UNITS).nullable().default(null),
		active: z.boolean().default(true),
		tagIds: z.array(z.string()).max(20).default([])
	})
	.refine((d) => (d.durationValue == null) === (d.durationUnit == null), {
		message: 'durationValue and durationUnit must both be set or both be empty'
	});

export const POST: RequestHandler = async ({ request, locals }) => {
	guardAdmin(locals);
	const { tagIds, ...data } = await body(request, schema);
	const row = await db.insert(rewards).values(data).returning().get();
	await setEntityTags('reward', row.id, tagIds);
	return json(row);
};
