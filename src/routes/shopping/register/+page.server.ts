import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The register is a tab on /shopping now. Kept as a redirect so an old bookmark, and
 *  the link that used to be in the page head, still land somewhere sensible. */
export const load: PageServerLoad = async () => {
	redirect(307, '/shopping?tab=register');
};
