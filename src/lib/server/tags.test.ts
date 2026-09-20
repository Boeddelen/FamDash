import { beforeAll, describe, expect, it } from 'vitest';
import { db } from './db';
import { tags as tagsTable } from './db/schema';
import { runMigrations } from './db/migrate';
import { clearEntityTags, getTagsFor, getTagsForEntities, listTags, setEntityTags } from './tags';

beforeAll(() => {
	runMigrations();
});

async function makeTag(label: string, color = '#6b7280') {
	return db.insert(tagsTable).values({ label, color }).returning().get();
}

describe('tags', () => {
	it('listTags returns everything, alphabetically by label', async () => {
		await makeTag('Zeta tag');
		await makeTag('Alpha tag');

		const all = await listTags();
		const labels = all.map((t) => t.label);
		const idx = (l: string) => labels.indexOf(l);
		expect(idx('Alpha tag')).toBeLessThan(idx('Zeta tag'));
	});

	it('setEntityTags replaces the full set rather than appending', async () => {
		const t1 = await makeTag('Set A tag 1');
		const t2 = await makeTag('Set A tag 2');
		const entityId = crypto.randomUUID();

		await setEntityTags('chore', entityId, [t1.id, t2.id]);
		expect((await getTagsFor('chore', entityId)).map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());

		await setEntityTags('chore', entityId, [t2.id]);
		const after = await getTagsFor('chore', entityId);
		expect(after.map((t) => t.id)).toEqual([t2.id]);

		await setEntityTags('chore', entityId, []);
		expect(await getTagsFor('chore', entityId)).toEqual([]);
	});

	it('scopes tags by entityType — a chore and a plan_item can reuse the same id without leaking tags', async () => {
		const choreTag = await makeTag('Chore-only tag');
		const planTag = await makeTag('Plan-only tag');
		const sharedId = crypto.randomUUID();

		await setEntityTags('chore', sharedId, [choreTag.id]);
		await setEntityTags('plan_item', sharedId, [planTag.id]);

		expect((await getTagsFor('chore', sharedId)).map((t) => t.id)).toEqual([choreTag.id]);
		expect((await getTagsFor('plan_item', sharedId)).map((t) => t.id)).toEqual([planTag.id]);
	});

	it('getTagsForEntities batches lookups keyed by entity id, and returns {} for an empty list', async () => {
		const t1 = await makeTag('Batch tag 1');
		const t2 = await makeTag('Batch tag 2');
		const e1 = crypto.randomUUID();
		const e2 = crypto.randomUUID();

		await setEntityTags('chore', e1, [t1.id]);
		await setEntityTags('chore', e2, [t1.id, t2.id]);

		const batch = await getTagsForEntities('chore', [e1, e2, crypto.randomUUID()]);
		expect(batch[e1].map((t) => t.id)).toEqual([t1.id]);
		expect(batch[e2].map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());

		expect(await getTagsForEntities('chore', [])).toEqual({});
	});

	it('deduplicates tag ids passed to setEntityTags', async () => {
		const t1 = await makeTag('Dedup tag');
		const entityId = crypto.randomUUID();

		await setEntityTags('chore', entityId, [t1.id, t1.id, t1.id]);
		expect(await getTagsFor('chore', entityId)).toHaveLength(1);
	});

	it('supports the reward entity type, scoped separately from other kinds', async () => {
		const rewardTag = await makeTag('Robin-only tag');
		const rewardId = crypto.randomUUID();

		await setEntityTags('reward', rewardId, [rewardTag.id]);
		expect((await getTagsFor('reward', rewardId)).map((t) => t.id)).toEqual([rewardTag.id]);
		// A chore reusing the same id sees none of the reward's tags.
		expect(await getTagsFor('chore', rewardId)).toEqual([]);
	});

	it('clearEntityTags drops every link for that entity (used when it is deleted)', async () => {
		const t1 = await makeTag('Clear tag 1');
		const t2 = await makeTag('Clear tag 2');
		const entityId = crypto.randomUUID();

		await setEntityTags('reward', entityId, [t1.id, t2.id]);
		expect(await getTagsFor('reward', entityId)).toHaveLength(2);

		await clearEntityTags('reward', entityId);
		expect(await getTagsFor('reward', entityId)).toEqual([]);
	});
});
