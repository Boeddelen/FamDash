import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { household } from '$lib/server/db/schema';
import { body, guardAdmin, json, z } from '$lib/server/http';
import { refreshWeather } from '$lib/server/weather';
import type { RequestHandler } from './$types';

const schema = z.object({
	name: z.string().min(1).max(80).optional(),
	timezone: z.string().min(1).max(64).optional(),
	theme: z.enum(['auto', 'light', 'dark']).optional(),
	locale: z.enum(['nb', 'en']).optional(),
	weather: z
		.object({ lat: z.number(), lon: z.number(), label: z.string().max(120) })
		.nullable()
		.optional()
});

export const PATCH: RequestHandler = async ({ request, locals }) => {
	guardAdmin(locals);
	const data = await body(request, schema);
	const patch: Record<string, unknown> = {};
	if (data.name !== undefined) patch.name = data.name;
	if (data.timezone !== undefined) patch.timezone = data.timezone;
	if (data.theme !== undefined) patch.theme = data.theme;
	if (data.locale !== undefined) patch.locale = data.locale;
	if (data.weather !== undefined) {
		patch.weatherLat = data.weather?.lat ?? null;
		patch.weatherLon = data.weather?.lon ?? null;
		patch.weatherLabel = data.weather?.label ?? null;
	}
	await db.update(household).set(patch).where(eq(household.id, 'singleton'));
	if (data.weather !== undefined) refreshWeather().catch(() => {});
	return json({ ok: true });
};
