import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { entityTags, tags } from './db/schema';

/** 'plan_series' holds the tag template for a recurring notation — copied onto each
 *  occurrence (a 'plan_item') as it's generated; see plans/generate.ts. 'reward' tags
 *  a catalog entry — households can use e.g. a member's name as a tag to connect a
 *  reward to whoever it's meant for (see RewardBandit's redeem-for default). */
export type EntityType = 'chore' | 'plan_item' | 'plan_series' | 'reward';
export type TagRef = { id: string; label: string; color: string };

export async function listTags(): Promise<TagRef[]> {
	return db.select().from(tags).orderBy(asc(tags.label));
}

/** Tags for a batch of entities of the same type, keyed by entity id. */
export async function getTagsForEntities(
	entityType: EntityType,
	entityIds: string[]
): Promise<Record<string, TagRef[]>> {
	const out: Record<string, TagRef[]> = {};
	if (entityIds.length === 0) return out;

	const rows = await db
		.select({
			entityId: entityTags.entityId,
			id: tags.id,
			label: tags.label,
			color: tags.color
		})
		.from(entityTags)
		.innerJoin(tags, eq(tags.id, entityTags.tagId))
		.where(and(eq(entityTags.entityType, entityType), inArray(entityTags.entityId, entityIds)))
		.orderBy(asc(tags.label));

	for (const r of rows) {
		if (!out[r.entityId]) out[r.entityId] = [];
		out[r.entityId].push({ id: r.id, label: r.label, color: r.color });
	}
	return out;
}

export async function getTagsFor(entityType: EntityType, entityId: string): Promise<TagRef[]> {
	const all = await getTagsForEntities(entityType, [entityId]);
	return all[entityId] ?? [];
}

/** Replace all of an entity's tags with exactly this set. */
export async function setEntityTags(
	entityType: EntityType,
	entityId: string,
	tagIds: string[]
): Promise<void> {
	await db
		.delete(entityTags)
		.where(and(eq(entityTags.entityType, entityType), eq(entityTags.entityId, entityId)));
	const unique = [...new Set(tagIds)];
	if (unique.length) {
		await db.insert(entityTags).values(unique.map((tagId) => ({ tagId, entityType, entityId })));
	}
}

/** Drop an entity's tag links — call this from a DELETE route. `entity_tags.entityId`
 * is a polymorphic reference (not a real foreign key, since it points at whichever
 * table `entityType` names), so nothing cascades this automatically. */
export function clearEntityTags(entityType: EntityType, entityId: string): Promise<void> {
	return setEntityTags(entityType, entityId, []);
}
