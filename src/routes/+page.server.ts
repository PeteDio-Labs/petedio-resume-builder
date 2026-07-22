import { isDemoMode } from '$lib/server/config';
import { createRepository } from '$lib/server/db/repository';
import { hasUsableContent } from '$lib/resume/analyze';
import { normalizeProfile } from '$lib/resume/schema';
import type { PageServerLoad } from './$types';

/**
 * The home screen answers "where am I", not "what does this app do" — so it
 * loads the counts it shows instead of describing features in prose.
 *
 * An unreachable database must not blank the page: the counts degrade to null
 * and every row still works as navigation.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const base = { user: locals.user, demo: isDemoMode() };
	if (!locals.user) return { ...base, stats: null };

	try {
		const repo = createRepository(locals.user.email);
		const [profileRow, resumes, applications] = await Promise.all([
			repo.profiles.get(),
			repo.resumes.list(),
			repo.applications.list()
		]);

		const profile = profileRow ? normalizeProfile(profileRow) : null;
		return {
			...base,
			stats: {
				profileStarted: profile ? hasUsableContent(profile) : false,
				roles: profile?.work.length ?? 0,
				stories: profile?.x_petedio.stories?.length ?? 0,
				resumes: resumes.length,
				applications: applications.length,
				active: applications.filter((a) => a.status === 'applied' || a.status === 'interviewing')
					.length
			}
		};
	} catch (err) {
		console.error('home: could not load counts', err);
		return { ...base, stats: null };
	}
};
