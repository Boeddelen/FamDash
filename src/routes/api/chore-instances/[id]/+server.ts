import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { choreInstances, chores } from '$lib/server/db/schema';
import { body, guardAdmin, json, z } from '$lib/server/http';
import { todayIso } from '$lib/server/date';
import type { RequestHandler } from './$types';

const schema = z.object({ status: z.enum(['todo', 'done', 'skipped']) });

/**
 * Mark a chore instance done/skipped/todo. Allowed in standard mode *for today's
 * occurrences only* — any other day needs admin (see the guard below). The current
 * operator (if any) is recorded as who completed it. When the chore has a checklist,
 * toggling the whole card also syncs every checklist item to match (all ticked when
 * done, none when not) so the two views never disagree.
 */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	const { status } = await body(request, schema);
	const done = status === 'done';

	const row = await db
		.select({ inst: choreInstances, chore: chores })
		.from(choreInstances)
		.innerJoin(chores, eq(chores.id, choreInstances.choreId))
		.where(eq(choreInstances.id, params.id))
		.get();
	if (!row) throw error(404, 'Not found');

	// A chore counts only on the day it's due. Ticking yesterday's off today would
	// backdate points into a week that has already been scored, and ticking tomorrow's
	// would claim them before the work exists — so both are a parent's call, made
	// deliberately after unlocking, rather than something a tap can do by accident.
	if (row.inst.dueDate !== todayIso()) guardAdmin(locals);

	const total = row.chore.checklist?.length ?? 0;
	const updated = await db
		.update(choreInstances)
		.set({
			status,
			checklistDone:
				total > 0 ? (done ? Array.from({ length: total }, (_, i) => i) : []) : row.inst.checklistDone,
			completedByMemberId: done ? (locals.operator?.id ?? null) : null,
			completedAt: done ? Math.floor(Date.now() / 1000) : null
		})
		.where(eq(choreInstances.id, params.id))
		.returning()
		.get();
	return json(updated);
};
