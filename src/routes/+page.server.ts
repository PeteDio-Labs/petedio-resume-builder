import { isDemoMode } from '$lib/server/config';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { user: locals.user, demo: isDemoMode() };
};
