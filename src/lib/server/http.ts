import { error, json } from '@sveltejs/kit';
import { z, type ZodType } from 'zod';
import { requireAdmin } from './auth';

export { json };

export function guardAdmin(locals: App.Locals) {
	return requireAdmin(locals);
}

/** Parse + validate a JSON request body, throwing a 400 on failure. */
export async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}
	const result = schema.safeParse(raw);
	if (!result.success) {
		throw error(400, result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
	}
	return result.data;
}

export { z };
