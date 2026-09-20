import { eq } from 'drizzle-orm';
import { db } from './db';
import { appSettings, household } from './db/schema';

export async function getSetting<T>(key: string): Promise<T | undefined> {
	const row = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
	return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key, value, updatedAt: Math.floor(Date.now() / 1000) })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value, updatedAt: Math.floor(Date.now() / 1000) }
		});
}

/** The household singleton, created lazily. */
export async function getHousehold() {
	let row = await db.select().from(household).where(eq(household.id, 'singleton')).get();
	if (!row) {
		await db.insert(household).values({ id: 'singleton' }).onConflictDoNothing();
		row = await db.select().from(household).where(eq(household.id, 'singleton')).get();
	}
	return row!;
}
