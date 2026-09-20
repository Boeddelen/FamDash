import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { bonusClaims, chores, choreInstances, members } from '../db/schema';
import { runMigrations } from '../db/migrate';
import { addDays, isoDate, todayIso } from '../date';
import { getTodayProgress } from './progress';

beforeAll(() => {
	runMigrations();
});

const today = todayIso();
const yesterday = isoDate(addDays(new Date(), -1));

async function makeMember(name: string) {
	return db.insert(members).values({ name }).returning().get();
}

async function makeChoreDue(memberId: string, dueDate: string, status: 'todo' | 'done' | 'skipped') {
	const c = await db
		.insert(chores)
		.values({ title: `${status} ${dueDate}`, assignedMemberId: memberId, points: 1 })
		.returning()
		.get();
	await db.insert(choreInstances).values({ choreId: c.id, dueDate, status }).returning().get();
	return c;
}

describe('getTodayProgress', () => {
	it('counts only chores due today, done over total', async () => {
		const m = await makeMember('Progress A');
		await makeChoreDue(m.id, today, 'done');
		await makeChoreDue(m.id, today, 'done');
		await makeChoreDue(m.id, today, 'todo');
		// Yesterday's work is somebody else's problem — the ring is strictly about today.
		await makeChoreDue(m.id, yesterday, 'todo');
		await makeChoreDue(m.id, isoDate(addDays(new Date(), 1)), 'todo');

		const p = await getTodayProgress([m.id]);
		expect(p[m.id]).toEqual({ done: 2, total: 3, bonus: false });
	});

	it('keeps a skipped chore in the denominator — the ring only closes on work actually done', async () => {
		const m = await makeMember('Progress B');
		await makeChoreDue(m.id, today, 'done');
		await makeChoreDue(m.id, today, 'skipped');

		const p = await getTodayProgress([m.id]);
		expect(p[m.id]).toEqual({ done: 1, total: 2, bonus: false });
	});

	it('reports total 0 when nothing is due today, so the avatar draws no ring at all', async () => {
		const m = await makeMember('Progress C');
		await makeChoreDue(m.id, yesterday, 'done');

		const p = await getTodayProgress([m.id]);
		expect(p[m.id]).toEqual({ done: 0, total: 0, bonus: false });
	});

	it('flags a bonus task claimed today, and ignores one claimed on another day', async () => {
		const m = await makeMember('Progress D');
		await makeChoreDue(m.id, today, 'done');
		await db.insert(bonusClaims).values({
			memberId: m.id,
			title: 'Wash the car',
			points: 15,
			claimedOn: yesterday
		});

		expect((await getTodayProgress([m.id]))[m.id]?.bonus).toBe(false);

		await db.insert(bonusClaims).values({
			memberId: m.id,
			title: 'Wash the car',
			points: 15,
			claimedOn: today
		});

		expect((await getTodayProgress([m.id]))[m.id]?.bonus).toBe(true);
	});

	it('gives every requested member an entry, and never mixes two members up', async () => {
		const a = await makeMember('Progress E');
		const b = await makeMember('Progress F');
		await makeChoreDue(a.id, today, 'done');
		await makeChoreDue(b.id, today, 'todo');
		await makeChoreDue(b.id, today, 'todo');

		const p = await getTodayProgress([a.id, b.id]);
		expect(p[a.id]).toEqual({ done: 1, total: 1, bonus: false });
		expect(p[b.id]).toEqual({ done: 0, total: 2, bonus: false });
	});

	it('returns an empty map for no members rather than querying for nothing', async () => {
		expect(await getTodayProgress([])).toEqual({});
	});
});
