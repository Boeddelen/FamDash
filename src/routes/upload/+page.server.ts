import { listDocumentGroups, listSchoolDocuments } from '$lib/server/school';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		isAdmin: !!locals.admin,
		groups: await listDocumentGroups(),
		documents: await listSchoolDocuments()
	};
};
