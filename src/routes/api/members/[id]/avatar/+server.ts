import { error } from '@sveltejs/kit';
import { guardAdmin, json } from '$lib/server/http';
import {
	deleteAvatar,
	isAllowedAvatarType,
	MAX_AVATAR_BYTES,
	readAvatar,
	saveAvatar
} from '$lib/server/avatars';
import { imageResponse } from '$lib/server/images';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const found = await readAvatar(params.id);
	if (!found) throw error(404, 'No avatar');
	// The dashboard redraws these on every page; answer repeat views from cache rather
	// than resending the picture. The ETag changes when the photo does.
	return imageResponse(found, request);
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	guardAdmin(locals);
	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'No image uploaded');
	if (!isAllowedAvatarType(file.type)) throw error(400, 'Use a JPG, PNG, WebP or GIF image');
	if (file.size > MAX_AVATAR_BYTES) throw error(413, 'Image is too large (max 8 MB)');
	await saveAvatar(params.id, file);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	guardAdmin(locals);
	await deleteAvatar(params.id);
	return json({ ok: true });
};
