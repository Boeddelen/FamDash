import { error } from '@sveltejs/kit';
import { verifyMemberPin, rateLimitOk } from '$lib/server/auth';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const OPERATOR_COOKIE = 'fd_operator';
const schema = z.object({
	memberId: z.string().nullable(),
	pin: z.string().optional()
});

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const { memberId, pin } = await body(request, schema);

	if (memberId === null) {
		cookies.delete(OPERATOR_COOKIE, { path: '/' });
		return json({ ok: true, operator: null });
	}

	if (!(await rateLimitOk(`pin:${getClientAddress()}`, 15, 300))) {
		throw error(429, 'Too many attempts');
	}
	if (!(await verifyMemberPin(memberId, pin ?? ''))) {
		throw error(401, 'Wrong PIN');
	}

	cookies.set(OPERATOR_COOKIE, memberId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30
	});
	return json({ ok: true, operator: memberId });
};
