import { describe, expect, it } from 'bun:test';
import type { Db } from 'mongodb';
import { createRepository } from './repository';
import { emptyProfile } from '../../resume/schema';

/**
 * A tiny in-memory stand-in for the subset of the Mongo Db API the repository
 * uses (findOne / replaceOne with upsert). It lets us prove row-scoping
 * without a live MongoDB — CI is GitHub-hosted and has no database.
 */
function fakeDb() {
	const store: Record<string, Record<string, unknown>[]> = {};
	const matches = (doc: Record<string, unknown>, filter: Record<string, unknown>) =>
		Object.entries(filter).every(([k, v]) => doc[k] === v);

	const db = {
		_store: store,
		collection(name: string) {
			store[name] ??= [];
			const col = store[name];
			return {
				async findOne(filter: Record<string, unknown> = {}) {
					return col.find((d) => matches(d, filter)) ?? null;
				},
				async replaceOne(
					filter: Record<string, unknown>,
					replacement: Record<string, unknown>,
					opts?: { upsert?: boolean }
				) {
					const idx = col.findIndex((d) => matches(d, filter));
					if (idx >= 0) col[idx] = { ...replacement };
					else if (opts?.upsert) col.push({ ...replacement });
					return { acknowledged: true };
				},
				async insertOne(doc: Record<string, unknown>) {
					col.push({ ...doc });
					return { acknowledged: true, insertedId: 'fake' };
				}
			};
		}
	};
	return db as unknown as Db;
}

describe('ScopedProfile', () => {
	it('returns null when the user has no profile yet', async () => {
		const db = fakeDb();
		const repo = createRepository('jane@example.com', () => Promise.resolve(db));
		expect(await repo.profiles.get()).toBeNull();
	});

	it('upsert stamps userEmail + timestamps and get reads it back', async () => {
		const db = fakeDb();
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
		const db = fakeDb();
		const repo = createRepository('jane@example.com', () => Promise.resolve(db));

		const first = await repo.profiles.upsert(emptyProfile());
		const second = await repo.profiles.upsert(emptyProfile());

		expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
		expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());

		// Still exactly one row for this user (replace, not insert).
		const store = (db as unknown as { _store: Record<string, unknown[]> })._store;
		expect(store.profiles).toHaveLength(1);
	});

	it('is row-scoped: one user cannot read another user\'s profile', async () => {
		const db = fakeDb(); // shared "database", two users
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
