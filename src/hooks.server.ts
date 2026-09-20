import { redirect, type Handle } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { runMigrations } from '$lib/server/db/migrate';
import { db } from '$lib/server/db';
import { members } from '$lib/server/db/schema';
import { resolveAdmin } from '$lib/server/auth';
import { getHousehold } from '$lib/server/settings';
import { startJobs } from '$lib/server/jobs';

runMigrations();
startJobs();

const OPERATOR_COOKIE = 'fd_operator';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Scheme-agnostic same-host CSRF check. We disable SvelteKit's built-in Origin
 * check (see svelte.config.js) because adapter-node assumes https; instead we
 * require that any Origin header shares a host with the request itself, which
 * still blocks cross-site form posts while allowing http access via localhost,
 * the Mac's hostname or its LAN IP.
 */
function csrfOk(event: Parameters<Handle>[0]['event']): boolean {
	if (!MUTATING.has(event.request.method)) return true;
	const origin = event.request.headers.get('origin');
	if (!origin) return true; // non-browser client; sensitive routes still require admin
	try {
		return new URL(origin).host === event.request.headers.get('host');
	} catch {
		return false;
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	if (!csrfOk(event)) {
		return new Response('Cross-site request blocked', { status: 403 });
	}

	const house = await getHousehold();
	event.locals.setupComplete = house.setupComplete;

	event.locals.admin = await resolveAdmin(event.cookies);

	const operatorId = event.cookies.get(OPERATOR_COOKIE);
	event.locals.operator = operatorId
		? ((await db.select().from(members).where(eq(members.id, operatorId)).get()) ?? null)
		: null;

	const { pathname } = event.url;
	const isSetupRoute = pathname === '/setup' || pathname.startsWith('/api/setup');
	const isInternal =
		pathname.startsWith('/healthz') || pathname.startsWith('/feed/') || pathname === '/favicon.ico';

	if (!house.setupComplete && !isSetupRoute && !isInternal) {
		throw redirect(303, '/setup');
	}
	if (house.setupComplete && pathname === '/setup') {
		throw redirect(303, '/');
	}

	const response = await resolve(event);
	// Baseline hardening headers. No CSP here: dynamic per-member/per-tag colors are
	// applied via inline `style="--c:…"` attributes throughout the UI, which a CSP
	// strict enough to matter would have to blanket-allow with 'unsafe-inline' anyway.
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	return response;
};
