import * as argon2 from 'argon2';
import { error } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { eq, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { adminSessions, admins, members, rateLimits } from './db/schema';
import { ADMIN_IDLE_TIMEOUT_MIN } from './config';

const ADMIN_COOKIE = 'fd_admin';
const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * Who is currently elevated. `kind` distinguishes a real admin account from an adult
 * family member who unlocked with their own PIN — they get the same powers, but a
 * member has no admin row, so anything storing an admin id must check this first.
 */
export type AdminContext = {
	id: string;
	name: string;
	email: string;
	sessionId: string;
	kind: 'admin' | 'member';
};

export async function hashSecret(secret: string): Promise<string> {
	return argon2.hash(secret);
}

export async function verifySecret(hash: string, secret: string): Promise<boolean> {
	try {
		return await argon2.verify(hash, secret);
	} catch {
		return false;
	}
}

/** Resolve the current admin elevation, refreshing its idle timer. Null in standard mode. */
export async function resolveAdmin(cookies: Cookies): Promise<AdminContext | null> {
	const sid = cookies.get(ADMIN_COOKIE);
	if (!sid) return null;

	const cutoff = nowSec() - ADMIN_IDLE_TIMEOUT_MIN * 60;
	// Sweep expired sessions opportunistically.
	await db.delete(adminSessions).where(lt(adminSessions.lastActivityAt, cutoff));

	const session = await db.select().from(adminSessions).where(eq(adminSessions.id, sid)).get();
	if (!session) {
		cookies.delete(ADMIN_COOKIE, { path: '/' });
		return null;
	}

	let ctx: AdminContext | null = null;
	if (session.adminId) {
		const admin = await db.select().from(admins).where(eq(admins.id, session.adminId)).get();
		if (admin) {
			ctx = { id: admin.id, name: admin.name, email: admin.email, sessionId: sid, kind: 'admin' };
		}
	} else if (session.memberId) {
		const member = await db.select().from(members).where(eq(members.id, session.memberId)).get();
		// Re-checked on every request, not just at sign-in: demoting an adult to a child
		// (or clearing their PIN) revokes their elevation immediately.
		if (member && member.role === 'adult' && member.pinHash) {
			ctx = { id: member.id, name: member.name, email: '', sessionId: sid, kind: 'member' };
		}
	}

	if (!ctx) {
		await db.delete(adminSessions).where(eq(adminSessions.id, sid));
		cookies.delete(ADMIN_COOKIE, { path: '/' });
		return null;
	}

	await db
		.update(adminSessions)
		.set({ lastActivityAt: nowSec() })
		.where(eq(adminSessions.id, sid));

	return ctx;
}

async function createAdminSession(
	cookies: Cookies,
	who: { id: string; name: string; email: string; kind: 'admin' | 'member' }
): Promise<AdminContext> {
	const session = await db
		.insert(adminSessions)
		.values(who.kind === 'admin' ? { adminId: who.id } : { memberId: who.id })
		.returning()
		.get();

	cookies.set(ADMIN_COOKIE, session.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false, // LAN / http; set true behind TLS
		maxAge: 60 * 60 * 12
	});
	return { id: who.id, name: who.name, email: who.email, sessionId: session.id, kind: who.kind };
}

export async function loginAdmin(
	cookies: Cookies,
	email: string,
	password: string
): Promise<AdminContext | null> {
	const admin = await db
		.select()
		.from(admins)
		.where(eq(admins.email, email.trim().toLowerCase()))
		.get();
	if (!admin || !(await verifySecret(admin.passwordHash, password))) return null;
	return createAdminSession(cookies, { ...admin, kind: 'admin' });
}

/**
 * Sign in with just a PIN — convenient on a touchscreen. Since a PIN doesn't name an
 * account, every candidate with a PIN set is tried in turn (a household has a handful,
 * so this is cheap); the first match wins.
 *
 * Admin accounts are tried first, then **adult** family members using the same PIN they
 * use to pick themselves on the dashboard: parents are admins. Children are never
 * candidates here no matter what PIN they enter.
 */
export async function loginAdminWithPin(cookies: Cookies, pin: string): Promise<AdminContext | null> {
	const adminAccounts = await db.select().from(admins);
	for (const admin of adminAccounts) {
		if (admin.pinHash && (await verifySecret(admin.pinHash, pin))) {
			return createAdminSession(cookies, { ...admin, kind: 'admin' });
		}
	}

	const adults = await db.select().from(members).where(eq(members.role, 'adult'));
	for (const member of adults) {
		if (member.pinHash && (await verifySecret(member.pinHash, pin))) {
			return createAdminSession(cookies, {
				id: member.id,
				name: member.name,
				email: '',
				kind: 'member'
			});
		}
	}
	return null;
}

export async function logoutAdmin(cookies: Cookies): Promise<void> {
	const sid = cookies.get(ADMIN_COOKIE);
	if (sid) await db.delete(adminSessions).where(eq(adminSessions.id, sid));
	cookies.delete(ADMIN_COOKIE, { path: '/' });
}

/** Guard for "big edit" endpoints. Throws 401 when not elevated. */
export function requireAdmin(locals: App.Locals): AdminContext {
	if (!locals.admin) throw error(401, 'Admin sign-in required');
	return locals.admin;
}

export async function createAdmin(name: string, email: string, password: string) {
	return db
		.insert(admins)
		.values({
			name: name.trim(),
			email: email.trim().toLowerCase(),
			passwordHash: await hashSecret(password)
		})
		.returning()
		.get();
}

export async function verifyMemberPin(memberId: string, pin: string): Promise<boolean> {
	const m = await db.select().from(members).where(eq(members.id, memberId)).get();
	if (!m) return false;
	if (!m.pinHash) return true; // no PIN set → open profile
	return verifySecret(m.pinHash, pin);
}

/** Fixed-window rate limit. Records the hit and returns true when still under `max`. */
export async function rateLimitOk(bucket: string, max: number, windowSec = 300): Promise<boolean> {
	const windowStart = Math.floor(nowSec() / windowSec) * windowSec;
	const row = await db
		.insert(rateLimits)
		.values({ bucket, windowStart, count: 1 })
		.onConflictDoUpdate({
			target: [rateLimits.bucket, rateLimits.windowStart],
			set: { count: sql`${rateLimits.count} + 1` }
		})
		.returning()
		.get();
	// Opportunistically drop stale windows.
	await db.delete(rateLimits).where(lt(rateLimits.windowStart, windowStart - windowSec * 4));
	return row.count <= max;
}
