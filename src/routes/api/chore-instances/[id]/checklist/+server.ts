import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { choreInstances, chores } from '$lib/server/db/schema';
import { body, guardAdmin, json, z } from '$lib/server/http';
import { todayIso } from '$lib/server/date';
import type { RequestHandler } from './$types';

const schema = z.object({ index: z.number().int().min(0).max(49) });

/**
 * Toggle one checklist step for a chore instance. Standard mode for today's occurrences
 * and admin-only for any other day, same as the plain done/undone toggle — otherwise the
 * checklist would be a way round the date rule, since ticking every step completes the
 * instance. When every step ends up ticked the whole instance flips to
 * "done" (credited to the current operator); unticking any step drops it back to
 * "todo" — the card status always mirrors the checklist.
 */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	const { index } = await body(request, schema);

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
	if (index >= total) throw error(400, 'No such checklist item');

	const current = new Set(row.inst.checklistDone ?? []);
	if (current.has(index)) current.delete(index);
	else current.add(index);
	const done = current.size === total;

	const updated = await db
		.update(choreInstances)
		.set({
			checklistDone: [...current].sort((a, b) => a - b),
			status: done ? 'done' : 'todo',
			completedByMemberId: done ? (locals.operator?.id ?? null) : null,
			completedAt: done ? Math.floor(Date.now() / 1000) : null
		})
		.where(eq(choreInstances.id, params.id))
		.returning()
		.get();
	return json(updated);
};
