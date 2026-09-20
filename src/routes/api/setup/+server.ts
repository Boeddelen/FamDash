import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { admins, household, members } from '$lib/server/db/schema';
import { createAdmin, loginAdmin } from '$lib/server/auth';
import { body, json, z } from '$lib/server/http';
import type { RequestHandler } from './$types';

const schema = z.object({
	householdName: z.string().min(1).max(80),
	timezone: z.string().min(1).max(64),
	locale: z.enum(['nb', 'en']).default('nb'),
	admin: z.object({
		name: z.string().min(1).max(60),
		email: z.string().email(),
		password: z.string().min(8).max(200)
	}),
	weather: z
		.object({ lat: z.number(), lon: z.number(), label: z.string().max(120) })
		.nullable()
		.optional(),
	members: z
		.array(
			z.object({
				name: z.string().min(1).max(60),
				role: z.enum(['adult', 'child']).default('child'),
				emoji: z.string().max(8).default('🙂'),
				color: z.string().max(20).default('#4f46e5')
			})
		)
		.max(20)
		.default([])
});

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	const house = await db.select().from(household).where(eq(household.id, 'singleton')).get();
	if (house?.setupComplete) throw error(409, 'Setup already complete');

	const data = await body(request, schema);
	const existingAdmins = await db.select({ id: admins.id }).from(admins).get();
	if (existingAdmins) throw error(409, 'An admin already exists');

	await createAdmin(data.admin.name, data.admin.email, data.admin.password);

	if (data.members.length) {
		await db
			.insert(members)
			.values(data.members.map((m, i) => ({ ...m, sortOrder: i })));
	}

	await db
		.update(household)
		.set({
			name: data.householdName,
			timezone: data.timezone,
			locale: data.locale,
			weatherLat: data.weather?.lat ?? null,
			weatherLon: data.weather?.lon ?? null,
			weatherLabel: data.weather?.label ?? null,
			setupComplete: true
		})
		.where(eq(household.id, 'singleton'));

	await loginAdmin(cookies, data.admin.email, data.admin.password);
	locals.setupComplete = true;

	return json({ ok: true });
};
