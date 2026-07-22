import { describe, expect, it } from 'bun:test';
import { createInMemoryDb } from './memory';
import { createRepository, type ApplicationInput } from './repository';

function job(url: string, resumeId: string | null = null): ApplicationInput {
	return { url, title: '', company: '', status: 'saved', resumeId, notes: '' };
}

describe('ScopedApplications', () => {
	it('create/list/get are row-scoped and hold the resume link', async () => {
		const db = createInMemoryDb();
		const jane = createRepository('jane@x', () => Promise.resolve(db));
		const bob = createRepository('bob@x', () => Promise.resolve(db));

		const a = await jane.applications.create(job('https://jobs.example/1', 'resume-123'));
		expect(a.userEmail).toBe('jane@x');
		expect(a.resumeId).toBe('resume-123'); // the relationship
		expect(a.status).toBe('saved');
		expect(a.deletedAt).toBeNull();

		expect(await jane.applications.list()).toHaveLength(1);
		expect(await bob.applications.list()).toHaveLength(0); // scoped
		expect(await bob.applications.get(a.id)).toBeNull(); // scoped
	});

	it('update changes status / resume link and enforces ownership', async () => {
		const db = createInMemoryDb();
		const jane = createRepository('jane@x', () => Promise.resolve(db));
		const bob = createRepository('bob@x', () => Promise.resolve(db));

		const a = await jane.applications.create(job('https://jobs.example/2'));
		const updated = await jane.applications.update(a.id, { status: 'interviewing', resumeId: 'r-9' });
		expect(updated?.status).toBe('interviewing');
		expect(updated?.resumeId).toBe('r-9');
		expect(updated?.createdAt.getTime()).toBe(a.createdAt.getTime());

		// bob cannot touch jane's application
		expect(await bob.applications.update(a.id, { status: 'offer' })).toBeNull();
		expect((await jane.applications.get(a.id))?.status).toBe('interviewing');
	});

	it('update can patch the qa[] answers', async () => {
		const db = createInMemoryDb();
		const jane = createRepository('jane@x', () => Promise.resolve(db));
		const a = await jane.applications.create(job('https://jobs.example/q'));
		expect(a.qa).toEqual([]);
		const entry = {
			id: 'q1',
			question: 'Why us?',
			kind: 'why-us' as const,
			context: '',
			targetChars: 0,
			storyId: null,
			answer: 'Because it fits.',
			updatedAt: new Date().toISOString()
		};
		const up = await jane.applications.update(a.id, { qa: [entry] });
		expect(up?.qa).toHaveLength(1);
		expect((await jane.applications.get(a.id))?.qa[0].answer).toBe('Because it fits.');
	});

	it('softDelete hides from get + list', async () => {
		const db = createInMemoryDb();
		const jane = createRepository('jane@x', () => Promise.resolve(db));
		const a = await jane.applications.create(job('https://jobs.example/3'));
		await jane.applications.softDelete(a.id);
		expect(await jane.applications.get(a.id)).toBeNull();
		expect(await jane.applications.list()).toHaveLength(0);
	});
});
