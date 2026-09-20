import { and, asc, eq, gte, lte, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { planItems, planSeries } from '$lib/server/db/schema';
import { setEntityTags } from '$lib/server/tags';
import { setItemMembers, setSeriesMembers } from '$lib/server/plans';
import { regenerateSeries } from '$lib/server/plans/generate';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ url }) => {
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	// Interval overlap, not just a start-date match — a multi-day item that started
	// before `from` can still span into the requested window.
	const where =
		from && to
			? and(lte(planItems.date, to), or(gte(planItems.date, from), gte(planItems.endDate, from)))
			: undefined;
	const rows = await db
		.select()
		.from(planItems)
		.where(where)
		.orderBy(asc(planItems.date), asc(planItems.sortOrder));
	return json(rows);
};

const schema = z.object({
	title: z.string().min(1).max(160),
	date: z.string().regex(dateRe),
	endDate: z.string().regex(dateRe).nullable().optional(),
	time: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.nullable()
		.optional(),
	/** Legacy single-member field, still accepted; folded into memberIds. */
	memberId: z.string().nullable().optional(),
	memberIds: z.array(z.string()).max(20).optional(),
	category: z.string().max(40).nullable().optional(),
	notes: z.string().max(500).nullable().optional(),
	tagIds: z.array(z.string()).max(20).default([]),
	// Recurrence — when set (and not 'none'), this creates a plan_series and
	// materialises its occurrences instead of a single row.
	recurrence: z.enum(['none', 'daily', 'weekly', 'weekdays', 'custom']).default('none'),
	weekdayMask: z.number().int().min(0).max(127).default(0),
	durationDays: z.number().int().min(1).max(60).default(1)
});

/** Creating and editing plan items ("calendar notations") is a normal, non-admin activity. */
export const POST: RequestHandler = async ({ request }) => {
	const data = await body(request, schema);
	const memberIds = [...new Set([...(data.memberIds ?? []), ...(data.memberId ? [data.memberId] : [])])];

	if (data.recurrence !== 'none') {
		const series = await db
			.insert(planSeries)
			.values({
				title: data.title,
				category: data.category ?? null,
				notes: data.notes ?? null,
				time: data.time ?? null,
				durationDays: data.durationDays,
				recurrence: data.recurrence,
				weekdayMask: data.weekdayMask,
				startDate: data.date
			})
			.returning()
			.get();
		if (memberIds.length) await setSeriesMembers(series.id, memberIds);
		if (data.tagIds.length) await setEntityTags('plan_series', series.id, data.tagIds);
		await regenerateSeries(series.id);

		const occurrences = await db
			.select()
			.from(planItems)
			.where(eq(planItems.seriesId, series.id))
			.orderBy(asc(planItems.date));
		return json({ series, occurrences });
	}

	const endDate = data.endDate && data.endDate > data.date ? data.endDate : null;
	const row = await db
		.insert(planItems)
		.values({
			title: data.title,
			date: data.date,
			endDate,
			time: data.time ?? null,
			category: data.category ?? null,
			notes: data.notes ?? null
		})
		.returning()
		.get();
	if (memberIds.length) await setItemMembers(row.id, memberIds);
	await setEntityTags('plan_item', row.id, data.tagIds);
	return json(row);
};
