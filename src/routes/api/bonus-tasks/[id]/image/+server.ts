import { error } from '@sveltejs/kit';
import { guardAdmin, json } from '$lib/server/http';
import { deleteBonusImage, readBonusImage, saveBonusImage } from '$lib/server/bonusImages';
import { imageResponse, isAllowedImageType, MAX_IMAGE_BYTES } from '$lib/server/images';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const found = await readBonusImage(params.id);
	if (!found) throw error(404, 'No image');
	return imageResponse(found, request);
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'No image uploaded');
	if (!isAllowedImageType(file.type)) throw error(400, 'Use a JPG, PNG, WebP or GIF image');
	if (file.size > MAX_IMAGE_BYTES) throw error(413, 'Image is too large (max 8 MB)');
	await saveBonusImage(params.id, file);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	await deleteBonusImage(params.id);
	return json({ ok: true });
};
