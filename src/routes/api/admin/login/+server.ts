import { error } from '@sveltejs/kit';
import { loginAdmin, rateLimitOk } from '$lib/server/auth';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const { email, password } = await body(request, schema);
	if (!(await rateLimitOk(`admin-login:${getClientAddress()}`, 8, 300))) {
		throw error(429, 'Too many attempts. Wait a few minutes.');
	}
	const admin = await loginAdmin(cookies, email, password);
	if (!admin) throw error(401, 'Wrong email or password');
	return json({ name: admin.name, email: admin.email });
};
