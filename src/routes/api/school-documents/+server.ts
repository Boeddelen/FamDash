import { error } from '@sveltejs/kit';
import { json } from '$lib/server/http';
import { listSchoolDocuments, saveSchoolDocument } from '$lib/server/school';
import type { RequestHandler } from './$types';

const MAX_BYTES = 25 * 1024 * 1024;

export const GET: RequestHandler = async () => {
	return json(await listSchoolDocuments());
};

// Deliberately not admin-gated: a weekly plan arriving on a Monday is a chore anyone in
// the house should be able to do from the tablet without finding a parent to unlock it.
// The destructive half (deleting a document, managing boxes) is still admin-only.
export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = locals.admin;
	const form = await request.formData();
	const file = form.get('file');
	const title = form.get('title');
	const groupId = form.get('groupId');
	if (!(file instanceof File)) throw error(400, 'No file uploaded');
	if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
		throw error(400, 'Only PDF files are supported');
	}
	if (file.size > MAX_BYTES) throw error(413, 'File is too large (max 25 MB)');

	// uploadedByAdminId names a row in `admins`; a parent elevated via their member PIN
	// isn't one, so it's recorded as unattributed rather than with an id that resolves
	// to nothing.
	const { id } = await saveSchoolDocument(
		file,
		admin?.kind === 'admin' ? admin.id : null,
		typeof title === 'string' ? title : undefined,
		typeof groupId === 'string' && groupId ? groupId : null
	);
	return json({ id });
};
