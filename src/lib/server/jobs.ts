/**
 * A tiny in-process job queue for work that is too slow to block a request on.
 *
 * WHY IT EXISTS: keyword extraction is a real model call. Measured on the fast
 * lane, a warm qwen3.5:4b takes ~5-8s for a full job description. That is fine
 * for a background task and awful to stare at, so the route hands back the
 * instant deterministic result and queues the model to refine it.
 *
 * WHY NOT A REAL QUEUE: the app is a single Bun process serving one household.
 * A Mongo-backed queue with a worker loop would add a collection, a poller, and
 * a whole failure mode (stuck jobs) to solve a problem we do not have. Jobs are
 * held in memory and lost on restart — which is safe here precisely because the
 * caller already has a usable answer before the job is even queued.
 *
 * Every job records the email that created it and `get` demands a match, so one
 * user can never read another's result by guessing an id.
 */
export type JobStatus = 'running' | 'done' | 'failed';

export interface Job<T> {
	id: string;
	userEmail: string;
	status: JobStatus;
	result: T | null;
	error: string | null;
	startedAt: number;
	finishedAt: number | null;
}

/** Jobs older than this are dropped — nothing polls for a result this stale. */
const TTL_MS = 5 * 60 * 1000;
const MAX_JOBS = 200;

const jobs = new Map<string, Job<unknown>>();

function sweep(): void {
	const cutoff = Date.now() - TTL_MS;
	for (const [id, job] of jobs) {
		if ((job.finishedAt ?? job.startedAt) < cutoff) jobs.delete(id);
	}
	// Hard cap as a backstop against a flood of never-finishing jobs.
	if (jobs.size > MAX_JOBS) {
		const oldest = [...jobs.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt);
		for (const [id] of oldest.slice(0, jobs.size - MAX_JOBS)) jobs.delete(id);
	}
}

/**
 * Start `work` in the background and return a job id immediately.
 *
 * The promise is deliberately not awaited by the caller; a rejection is captured
 * on the job rather than becoming an unhandled rejection that takes the process
 * down.
 */
export function startJob<T>(userEmail: string, work: () => Promise<T>): string {
	sweep();
	const id = crypto.randomUUID();
	const job: Job<T> = {
		id,
		userEmail,
		status: 'running',
		result: null,
		error: null,
		startedAt: Date.now(),
		finishedAt: null
	};
	jobs.set(id, job as Job<unknown>);

	work()
		.then((result) => {
			job.result = result;
			job.status = 'done';
		})
		.catch((err: unknown) => {
			job.error = err instanceof Error ? err.message : String(err);
			job.status = 'failed';
			console.error(`job ${id} failed:`, err);
		})
		.finally(() => {
			job.finishedAt = Date.now();
		});

	return id;
}

/** Read a job — only for the user who started it. Unknown id => null. */
export function getJob<T>(userEmail: string, id: string): Job<T> | null {
	sweep();
	const job = jobs.get(id) as Job<T> | undefined;
	if (!job || job.userEmail !== userEmail) return null;
	return job;
}

/** Test seam: drop everything. */
export function clearJobs(): void {
	jobs.clear();
}
