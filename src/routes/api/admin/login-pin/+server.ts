import { error } from '@sveltejs/kit';
import { loginAdminWithPin, rateLimitOk } from '$lib/server/auth';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

// 6–10 digits for an admin account's PIN, 4–8 for an adult member's own PIN.
const schema = z.object({ pin: z.string().regex(/^\d{4,10}$/) });

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const { pin } = await body(request, schema);
	// Tighter than the email+password bucket: a PIN is a smaller search space.
	if (!(await rateLimitOk(`admin-pin:${getClientAddress()}`, 6, 300))) {
		throw error(429, 'Too many attempts. Wait a few minutes.');
	}
	const admin = await loginAdminWithPin(cookies, pin);
	if (!admin) throw error(401, 'Wrong PIN');
	return json({ name: admin.name, email: admin.email });
};
