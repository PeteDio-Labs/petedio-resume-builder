import { describe, expect, it } from 'bun:test';
import { createInMemoryDb } from './memory';
import { createRepository } from './repository';
import { emptyProfile, type ResumeDocument } from '../../resume/schema';

function draft(title: string): ResumeDocument {
	const d = emptyProfile();
	d.x_petedio.targetJob = { title };
	d.x_petedio.status = 'draft';
	return d;
}

describe('ScopedResumes', () => {
	it('create/get/list are row-scoped; softDelete hides the row', async () => {
		const db = createInMemoryDb();
		const jane = createRepository('jane@x', () => Promise.resolve(db));
		const bob = createRepository('bob@x', () => Promise.resolve(db));

		const r1 = await jane.resumes.create(draft('PM at Acme'));
		const r2 = await jane.resumes.create(draft('Eng at Globex'));
		expect(r1.id).not.toBe(r2.id);
		expect(r1.userEmail).toBe('jane@x');
		expect(r1.deletedAt).toBeNull();

		// list is scoped and contains both (order is by updatedAt; not asserted
		// here since two same-millisecond creates tie — that's a clock artifact,
		// not a bug worth a flaky assertion)
		const ids = (await jane.resumes.list()).map((r) => r.id);
		expect(ids).toHaveLength(2);
		expect(ids).toContain(r1.id);
		expect(ids).toContain(r2.id);
		expect(await bob.resumes.list()).toHaveLength(0);

		// get is scoped: bob cannot read jane's
		expect(await bob.resumes.get(r1.id)).toBeNull();
		expect((await jane.resumes.get(r1.id))?.x_petedio.targetJob?.title).toBe('PM at Acme');

		// softDelete hides from get + list
		await jane.resumes.softDelete(r1.id);
		expect(await jane.resumes.get(r1.id)).toBeNull();
		expect(await jane.resumes.list()).toHaveLength(1);
	});

	it('saveRevision increments, listRevisions is newest-first, hardDelete purges', async () => {
		const db = createInMemoryDb();
		const jane = createRepository('jane@x', () => Promise.resolve(db));
		const r = await jane.resumes.create(draft('PM'));
		await jane.resumes.saveRevision(r.id, draft('PM v1'), 'first');
		await jane.resumes.saveRevision(r.id, draft('PM v2'), 'second');

		const revs = await jane.resumes.listRevisions(r.id);
		expect(revs.map((x) => x.rev)).toEqual([2, 1]);

		await jane.resumes.hardDelete(r.id);
		expect(await jane.resumes.get(r.id)).toBeNull();
		expect(await jane.resumes.listRevisions(r.id)).toHaveLength(0);
	});

	it('update preserves createdAt and enforces ownership', async () => {
		const db = createInMemoryDb();
		const jane = createRepository('jane@x', () => Promise.resolve(db));
		const bob = createRepository('bob@x', () => Promise.resolve(db));

		const r = await jane.resumes.create(draft('PM'));
		const updated = await jane.resumes.update(r.id, draft('PM Senior'));
		expect(updated?.createdAt.getTime()).toBe(r.createdAt.getTime());
		expect(updated?.x_petedio.targetJob?.title).toBe('PM Senior');

		// bob cannot update jane's resume
		expect(await bob.resumes.update(r.id, draft('hacked'))).toBeNull();
		expect((await jane.resumes.get(r.id))?.x_petedio.targetJob?.title).toBe('PM Senior');
	});
});
