import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '../db';
import { choreInstances, chores } from '../db/schema';
import { addDays, isoDate } from '../date';
import { dueDatesFor } from '../recurrence';

// Only ever materialise instances from today forward — a newly-added chore should
// not appear as a pile of missed days. Past instances that already exist (and any
// completions) are preserved.
const WINDOW_BACK = 0;
const WINDOW_FWD = 42;

// Re-exported for callers (and existing tests) that import it from here — the actual
// date math now lives in ../recurrence, shared with recurring plan-item notations.
export { dueDatesFor };

/** Ensure chore_instances exist for one chore across the rolling window. */
export async function regenerateChore(choreId: string): Promise<void> {
	const chore = await db.select().from(chores).where(eq(chores.id, choreId)).get();
	if (!chore) return;

	// Normalised to midnight: dueDatesFor compares whole calendar days (a "none"
	// chore's startDate is always midnight), so comparing against the current
	// wall-clock time would make a same-day one-off chore vanish after 00:00.
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const from = addDays(today, -WINDOW_BACK);
	const to = addDays(today, WINDOW_FWD);
	const wanted = chore.active ? new Set(dueDatesFor(chore, from, to)) : new Set<string>();

	const existing = await db
		.select()
		.from(choreInstances)
		.where(
			and(
				eq(choreInstances.choreId, choreId),
				gte(choreInstances.dueDate, isoDate(from)),
				lte(choreInstances.dueDate, isoDate(to))
			)
		);

	const haveByDate = new Map(existing.map((e) => [e.dueDate, e]));

	// Insert missing.
	const toInsert = [...wanted]
		.filter((date) => !haveByDate.has(date))
		.map((dueDate) => ({ choreId, dueDate }));
	if (toInsert.length) await db.insert(choreInstances).values(toInsert).onConflictDoNothing();

	// Remove future instances that are no longer scheduled and were never actioned.
	const orphanIds = existing
		.filter((e) => !wanted.has(e.dueDate) && e.status === 'todo' && e.dueDate >= isoDate(today))
		.map((e) => e.id);
	if (orphanIds.length)
		await db.delete(choreInstances).where(inArray(choreInstances.id, orphanIds));
}

export async function regenerateAll(): Promise<void> {
	const all = await db.select({ id: chores.id }).from(chores);
	for (const c of all) await regenerateChore(c.id);
}
