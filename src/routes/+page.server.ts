import { isDemoMode } from '$lib/server/config';
import { createRepository } from '$lib/server/db/repository';
import { hasUsableContent } from '$lib/resume/analyze';
import { normalizeProfile } from '$lib/resume/schema';
import { APPLICATION_STATUSES } from '$lib/applications';
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

		// Pipeline counts, in the order a job moves through it — the dashboard draws
		// them as proportions, so zero-count stages are dropped rather than rendered
		// as empty bars.
		const byStatus = APPLICATION_STATUSES.map((status) => ({
			status,
			count: applications.filter((a) => a.status === status).length
		})).filter((s) => s.count > 0);

		// Most recently touched applications. Dates cross the wire as ISO strings —
		// SvelteKit serializes Date fine, but the client only needs the instant.
		const recent = [...applications]
			.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
			.slice(0, 6)
			.map((a) => ({
				id: a.id,
				title: a.title,
				company: a.company,
				status: a.status,
				updatedAt: new Date(a.updatedAt).toISOString()
			}));

		return {
			...base,
			stats: {
				profileStarted: profile ? hasUsableContent(profile) : false,
				roles: profile?.work.length ?? 0,
				stories: profile?.x_petedio.stories?.length ?? 0,
				resumes: resumes.length,
				applications: applications.length,
				active: applications.filter((a) => a.status === 'applied' || a.status === 'interviewing')
					.length,
				byStatus,
				recent,
				lastActivity: recent[0]?.updatedAt ?? null
			}
		};
	} catch (err) {
		console.error('home: could not load counts', err);
		return { ...base, stats: null };
	}
};
