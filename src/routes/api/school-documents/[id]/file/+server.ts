import { error } from '@sveltejs/kit';
import { readSchoolDocumentFile } from '$lib/server/school';
import type { RequestHandler } from './$types';

/** Serve the stored PDF inline for the in-app viewer. Available in standard mode. */
export const GET: RequestHandler = async ({ params, url }) => {
	const found = await readSchoolDocumentFile(params.id);
	if (!found) throw error(404, 'Not found');
	const { doc, bytes } = found;
	const disposition = url.searchParams.get('dl') ? 'attachment' : 'inline';
	return new Response(new Uint8Array(bytes), {
		headers: {
			'content-type': doc.mimeType || 'application/pdf',
			'content-length': String(bytes.length),
			'content-disposition': `${disposition}; filename="${encodeURIComponent(doc.filename)}"`,
			'cache-control': 'private, max-age=3600'
		}
	});
};
