import { describe, expect, it, beforeEach } from 'bun:test';
import { clearJobs, getJob, startJob } from './jobs';

const settle = () => new Promise((r) => setTimeout(r, 10));

describe('background jobs', () => {
	beforeEach(() => clearJobs());

	it('returns immediately and reports the result when the work finishes', async () => {
		let resolve!: (v: string) => void;
		const id = startJob('a@example.com', () => new Promise<string>((r) => (resolve = r)));

		expect(getJob('a@example.com', id)!.status).toBe('running');
		resolve('done value');
		await settle();
		const job = getJob<string>('a@example.com', id)!;
		expect(job.status).toBe('done');
		expect(job.result).toBe('done value');
	});

	it('captures a rejection instead of leaving it unhandled', async () => {
		const id = startJob('a@example.com', async () => {
			throw new Error('model unavailable');
		});
		await settle();
		const job = getJob('a@example.com', id)!;
		expect(job.status).toBe('failed');
		expect(job.error).toBe('model unavailable');
	});

	it('will not hand a job to another user', async () => {
		const id = startJob('a@example.com', async () => 'secret');
		await settle();
		expect(getJob('b@example.com', id)).toBeNull();
		expect(getJob('a@example.com', id)).not.toBeNull();
	});

	it('reads an unknown id as absent rather than throwing', () => {
		expect(getJob('a@example.com', 'not-a-job')).toBeNull();
	});
});
