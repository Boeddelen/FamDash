import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { planItems, planSeries } from '$lib/server/db/schema';
import { clearEntityTags } from '$lib/server/tags';
import { json } from '$lib/server/http';
import type { RequestHandler } from './$types';

/** Deletes the whole recurring notation — its occurrences cascade-delete with it. */
export const DELETE: RequestHandler = async ({ params }) => {
	// entity_tags is a polymorphic reference, not a real foreign key, so it isn't
	// touched by the occurrences' cascade delete below — clear it explicitly first,
	// for the series' own tag template and for each occurrence about to disappear.
	const occurrences = await db
		.select({ id: planItems.id })
		.from(planItems)
		.where(eq(planItems.seriesId, params.id));
	for (const o of occurrences) await clearEntityTags('plan_item', o.id);
	await clearEntityTags('plan_series', params.id);

	await db.delete(planSeries).where(eq(planSeries.id, params.id));
	return json({ ok: true });
};
