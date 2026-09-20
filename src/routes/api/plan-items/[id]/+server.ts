import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { planItems } from '$lib/server/db/schema';
import { clearEntityTags, setEntityTags } from '$lib/server/tags';
import { addSkipDate, setItemMembers } from '$lib/server/plans';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	title: z.string().min(1).max(160).optional(),
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	endDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.optional(),
	time: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.nullable()
		.optional(),
	memberId: z.string().nullable().optional(), // legacy, folded into memberIds if present
	memberIds: z.array(z.string()).max(20).optional(),
	category: z.string().max(40).nullable().optional(),
	notes: z.string().max(500).nullable().optional(),
	done: z.boolean().optional(),
	sortOrder: z.number().int().optional(),
	tagIds: z.array(z.string()).max(20).optional()
});

export const PATCH: RequestHandler = async ({ request, params }) => {
	const { tagIds, memberId, memberIds, ...data } = await body(request, schema);
	const existing = await db.select().from(planItems).where(eq(planItems.id, params.id)).get();
	if (!existing) throw error(404, 'Not found');

	// Rescheduling a single occurrence of a recurring series off its scheduled date
	// detaches it (so regeneration won't duplicate it back in) and marks the vacated
	// date as skipped on the series so it isn't regenerated there either.
	const patch: typeof data & { seriesId?: string | null } = { ...data };
	if (existing.seriesId && data.date !== undefined && data.date !== existing.date) {
		patch.seriesId = null;
		await addSkipDate(existing.seriesId, existing.date);
	}

	const row = await db.update(planItems).set(patch).where(eq(planItems.id, params.id)).returning().get();
	if (!row) throw error(404, 'Not found');
	if (tagIds !== undefined) await setEntityTags('plan_item', row.id, tagIds);
	const mergedMemberIds = memberIds !== undefined || memberId !== undefined
		? [...new Set([...(memberIds ?? []), ...(memberId ? [memberId] : [])])]
		: undefined;
	if (mergedMemberIds !== undefined) await setItemMembers(row.id, mergedMemberIds);
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const existing = await db.select().from(planItems).where(eq(planItems.id, params.id)).get();
	if (existing?.seriesId) await addSkipDate(existing.seriesId, existing.date);
	await db.delete(planItems).where(eq(planItems.id, params.id));
	await clearEntityTags('plan_item', params.id);
	return json({ ok: true });
};
