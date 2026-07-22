import { describe, expect, it } from 'bun:test';
import type { Db } from 'mongodb';
import { createRepository } from './repository';
import { createInMemoryDb } from './memory';
import { emptyProfile } from '../../resume/schema';

describe('ScopedProfile', () => {
	it('returns null when the user has no profile yet', async () => {
		const db = createInMemoryDb();
		const repo = createRepository('jane@example.com', () => Promise.resolve(db));
		expect(await repo.profiles.get()).toBeNull();
	});

	it('upsert stamps userEmail + timestamps and get reads it back', async () => {
		const db = createInMemoryDb();
		const repo = createRepository('jane@example.com', () => Promise.resolve(db));

		const doc = emptyProfile();
		doc.basics.name = 'Jane Doe';
		const saved = await repo.profiles.upsert(doc);

		expect(saved.userEmail).toBe('jane@example.com');
		expect(saved.createdAt).toBeInstanceOf(Date);
		expect(saved.updatedAt).toBeInstanceOf(Date);

		const got = await repo.profiles.get();
		expect(got?.basics.name).toBe('Jane Doe');
		expect(got?.userEmail).toBe('jane@example.com');
	});

	it('a second upsert preserves createdAt but bumps updatedAt', async () => {
		const db = createInMemoryDb();
		const repo = createRepository('jane@example.com', () => Promise.resolve(db));

		const first = await repo.profiles.upsert(emptyProfile());
		const second = await repo.profiles.upsert(emptyProfile());

		expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
		expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());

		// Still exactly one row for this user (replace, not insert).
		const rows = await db.collection('profiles').find({ userEmail: 'jane@example.com' }).toArray();
		expect(rows).toHaveLength(1);
	});

	it('a wipe is recoverable via version history (UAT H3)', async () => {
		const db = createInMemoryDb();
		const jane = createRepository('jane@example.com', () => Promise.resolve(db));

		const full = emptyProfile();
		full.basics.name = 'Jane Doe';
		full.work = [
			{ name: 'Acme', position: 'PM', location: '', url: '', startDate: '2020-01', endDate: '2022-01', summary: '', highlights: ['Shipped a thing'] }
		];
		await jane.profiles.upsert(full);

		// First save has nothing to preserve yet.
		expect(await jane.profiles.listRevisions()).toHaveLength(0);

		// The destructive save that previously lost everything for good.
		await jane.profiles.upsert(emptyProfile(), 'Saved');
		expect((await jane.profiles.get())?.work).toHaveLength(0);

		// The replaced version was snapshotted.
		const revs = await jane.profiles.listRevisions();
		expect(revs).toHaveLength(1);
		expect(revs[0].doc.basics.name).toBe('Jane Doe');
		expect(revs[0].doc.work).toHaveLength(1);

		// And it can be rolled back.
		expect(await jane.profiles.restoreRevision(revs[0].rev)).toBe(true);
		const restored = await jane.profiles.get();
		expect(restored?.basics.name).toBe('Jane Doe');
		expect(restored?.work).toHaveLength(1);

		// Restoring also preserved the wiped state, so the undo is itself undoable.
		expect((await jane.profiles.listRevisions()).length).toBeGreaterThan(1);
	});

	it('revisions are row-scoped', async () => {
		const db = createInMemoryDb();
		const jane = createRepository('jane@example.com', () => Promise.resolve(db));
		const bob = createRepository('bob@example.com', () => Promise.resolve(db));
		await jane.profiles.upsert(emptyProfile());
		await jane.profiles.upsert(emptyProfile());
		expect((await jane.profiles.listRevisions()).length).toBeGreaterThan(0);
		expect(await bob.profiles.listRevisions()).toHaveLength(0);
		expect(await bob.profiles.restoreRevision(1)).toBe(false);
	});

	it('is row-scoped: one user cannot read another user\'s profile', async () => {
		const db = createInMemoryDb(); // shared "database", two users
		const jane = createRepository('jane@example.com', () => Promise.resolve(db));
		const bob = createRepository('bob@example.com', () => Promise.resolve(db));

		const janeDoc = emptyProfile();
		janeDoc.basics.name = 'Jane Doe';
		await jane.profiles.upsert(janeDoc);

		// Bob has no profile and cannot see Jane's.
		expect(await bob.profiles.get()).toBeNull();

		// Bob writes his own; Jane still only sees hers.
		const bobDoc = emptyProfile();
		bobDoc.basics.name = 'Bob Roberts';
		await bob.profiles.upsert(bobDoc);

		expect((await jane.profiles.get())?.basics.name).toBe('Jane Doe');
		expect((await bob.profiles.get())?.basics.name).toBe('Bob Roberts');
	});
});
