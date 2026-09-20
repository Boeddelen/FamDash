import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { rewards } from '$lib/server/db/schema';
import { clearEntityTags, setEntityTags } from '$lib/server/tags';
import { DURATION_UNITS } from '$lib/duration';
import { body, guardAdmin, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	title: z.string().trim().min(1).max(80).optional(),
	pointsCost: z.number().int().min(1).max(100_000).optional(),
	emoji: z.string().min(1).max(8).optional(),
	weight: z.number().int().min(1).max(100).optional(),
	durationValue: z.number().int().min(1).max(1000).nullable().optional(),
	durationUnit: z.enum(DURATION_UNITS).nullable().optional(),
	active: z.boolean().optional(),
	tagIds: z.array(z.string()).max(20).optional()
});

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const { tagIds, ...data } = await body(request, schema);
	const row = await db.update(rewards).set(data).where(eq(rewards.id, params.id)).returning().get();
	if (!row) throw error(404, 'Reward not found');
	if (tagIds !== undefined) await setEntityTags('reward', row.id, tagIds);
	return json(row);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	// Past redemptions keep their own title/cost snapshot, so this is safe.
	await db.delete(rewards).where(eq(rewards.id, params.id));
	await clearEntityTags('reward', params.id);
	return json({ ok: true });
};
