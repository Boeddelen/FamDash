import { beforeAll, describe, expect, it } from 'vitest';
import { db } from './db';
import { members, planItems } from './db/schema';
import { runMigrations } from './db/migrate';
import { setItemMembers } from './plans';
import { planItemsInRange } from './agenda';

beforeAll(() => {
	runMigrations();
});

async function makeMember(name: string) {
	return db.insert(members).values({ name }).returning().get();
}

describe('planItemsInRange', () => {
	it('finds a multi-day item that started before the window but still spans into it', async () => {
		const item = await db
			.insert(planItems)
			.values({ title: 'Family trip', date: '2030-01-01', endDate: '2030-01-05' })
			.returning()
			.get();

		// The requested window starts well after the item's start date, but before it ends.
		const rows = await planItemsInRange('2030-01-04', '2030-01-10');
		expect(rows.map((r) => r.id)).toContain(item.id);
	});

	it('excludes a multi-day item that already ended before the window', async () => {
		await db.insert(planItems).values({ title: 'Old trip', date: '2029-01-01', endDate: '2029-01-03' });
		const rows = await planItemsInRange('2029-02-01', '2029-02-10');
		expect(rows.find((r) => r.title === 'Old trip')).toBeUndefined();
	});

	it('excludes a single-day item outside the window (unchanged single-day behaviour)', async () => {
		await db.insert(planItems).values({ title: 'One day thing', date: '2028-06-15' });
		const inRange = await planItemsInRange('2028-06-14', '2028-06-16');
		const outOfRange = await planItemsInRange('2028-06-16', '2028-06-20');
		expect(inRange.some((r) => r.title === 'One day thing')).toBe(true);
		expect(outOfRange.some((r) => r.title === 'One day thing')).toBe(false);
	});

	it('carries every linked member — not just one — onto the agenda item', async () => {
		const a = await makeMember('Agenda Child A');
		const b = await makeMember('Agenda Child B');
		const item = await db
			.insert(planItems)
			.values({ title: 'Shared outing', date: '2027-03-03' })
			.returning()
			.get();
		await setItemMembers(item.id, [a.id, b.id]);

		const rows = await planItemsInRange('2027-03-01', '2027-03-05');
		const found = rows.find((r) => r.id === item.id);
		expect(found?.members.map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
	});
});
