import { error } from '@sveltejs/kit';
import { guardAdmin, json } from '$lib/server/http';
import { deleteShoppingImage, readShoppingImage, saveShoppingImage } from '$lib/server/shoppingImages';
import { imageResponse, isAllowedImageType, MAX_IMAGE_BYTES } from '$lib/server/images';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const found = await readShoppingImage(params.id);
	if (!found) throw error(404, 'No image');
	return imageResponse(found, request);
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'No image uploaded');
	if (!isAllowedImageType(file.type)) throw error(400, 'Use a JPG, PNG, WebP or GIF image');
	// The browser has already downscaled this (see $lib/image.ts) — the ceiling is a
	// backstop against something posting straight at the endpoint.
	if (file.size > MAX_IMAGE_BYTES) throw error(413, 'Image is too large (max 8 MB)');
	await saveShoppingImage(params.id, file);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	await deleteShoppingImage(params.id);
	return json({ ok: true });
};
