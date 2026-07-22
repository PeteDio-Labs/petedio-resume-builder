import { json, error } from '@sveltejs/kit';
import { getJob } from '$lib/server/jobs';
import type { RequestHandler } from './$types';

/**
 * Poll a background job (currently: model keyword refinement).
 *
 * Scoped like every other read — getJob demands the job belong to the caller,
 * so a guessed id from another session reads as 404, not as someone else's data.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Not signed in.');

	const job = getJob<unknown>(locals.user.email, params.id);
	// A job lost to a restart (jobs are in-memory) is indistinguishable from one
	// that never existed — both mean "stop polling", which is what the client does.
	if (!job) return json({ status: 'gone' }, { headers: { 'cache-control': 'no-store' } });

	return json(
		{ status: job.status, result: job.result, error: job.error },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
