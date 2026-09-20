import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from './db';
import { adminSessions, admins, members } from './db/schema';
import { runMigrations } from './db/migrate';
import { createAdmin, hashSecret, loginAdminWithPin, resolveAdmin } from './auth';

beforeAll(() => {
	runMigrations();
});

/** Minimal stand-in for SvelteKit's Cookies, enough for the session helpers. */
function fakeCookies() {
	const jar = new Map<string, string>();
	return {
		get: (k: string) => jar.get(k),
		set: (k: string, v: string) => void jar.set(k, v),
		delete: (k: string) => void jar.delete(k),
		jar
	} as never as Parameters<typeof resolveAdmin>[0] & { jar: Map<string, string> };
}

async function makeMember(name: string, role: 'adult' | 'child', pin?: string) {
	return db
		.insert(members)
		.values({ name, role, pinHash: pin ? await hashSecret(pin) : null })
		.returning()
		.get();
}

describe('admin elevation by PIN', () => {
	it('lets an adult member unlock admin with their own PIN', async () => {
		const parent = await makeMember('PIN Parent', 'adult', '4711');
		const cookies = fakeCookies();

		const ctx = await loginAdminWithPin(cookies, '4711');
		expect(ctx).not.toBeNull();
		expect(ctx!.kind).toBe('member');
		expect(ctx!.id).toBe(parent.id);
		expect(ctx!.name).toBe('PIN Parent');

		// And the session resolves on subsequent requests.
		const resolved = await resolveAdmin(cookies);
		expect(resolved?.id).toBe(parent.id);
		expect(resolved?.kind).toBe('member');
	});

	it('never elevates a child, even with a correct PIN', async () => {
		await makeMember('PIN Child', 'child', '8265');
		const ctx = await loginAdminWithPin(fakeCookies(), '8265');
		expect(ctx).toBeNull();
	});

	it('refuses an adult who has no PIN set', async () => {
		await makeMember('No PIN Parent', 'adult');
		// An empty PIN must not match a member with pinHash = null.
		expect(await loginAdminWithPin(fakeCookies(), '0000')).toBeNull();
	});

	it('revokes an existing elevation as soon as the adult is demoted to a child', async () => {
		const parent = await makeMember('Demoted Parent', 'adult', '5150');
		const cookies = fakeCookies();
		expect(await loginAdminWithPin(cookies, '5150')).not.toBeNull();
		expect(await resolveAdmin(cookies)).not.toBeNull();

		await db.update(members).set({ role: 'child' }).where(eq(members.id, parent.id));

		// Re-checked per request, so the open session stops working immediately.
		expect(await resolveAdmin(cookies)).toBeNull();
	});

	it('revokes an elevation when the adult’s PIN is cleared', async () => {
		const parent = await makeMember('Unpinned Parent', 'adult', '6262');
		const cookies = fakeCookies();
		expect(await loginAdminWithPin(cookies, '6262')).not.toBeNull();

		await db.update(members).set({ pinHash: null }).where(eq(members.id, parent.id));
		expect(await resolveAdmin(cookies)).toBeNull();
	});

	it('still signs in a real admin account by PIN, as an admin-kind session', async () => {
		const admin = await createAdmin('Pin Admin', 'pin-admin@example.com', 'familypass123');
		await db.update(admins).set({ pinHash: await hashSecret('903214') }).where(eq(admins.id, admin.id));

		const cookies = fakeCookies();
		const ctx = await loginAdminWithPin(cookies, '903214');
		expect(ctx?.kind).toBe('admin');
		expect(ctx?.id).toBe(admin.id);
	});

	it('drops the session row when it can no longer be resolved', async () => {
		const parent = await makeMember('Deleted Parent', 'adult', '7373');
		const cookies = fakeCookies();
		const ctx = await loginAdminWithPin(cookies, '7373');
		await db.delete(members).where(eq(members.id, parent.id));

		expect(await resolveAdmin(cookies)).toBeNull();
		const left = await db.select().from(adminSessions).where(eq(adminSessions.id, ctx!.sessionId)).get();
		expect(left).toBeUndefined();
	});
});
