/**
 * In-memory MongoDB stand-in for demo mode.
 *
 * Implements just the slice of the `Db`/`Collection` API the repository uses
 * (findOne / insertOne / replaceOne / deleteOne / find), backed by plain
 * arrays. This is the "demo" implementation of the data layer — the exact
 * analog of palworld-panel's `demoApplier`: same interface the real driver
 * exposes, no external dependency, selected from the environment at one factory
 * (see `provider.ts`). Data lives for the process lifetime and resets on
 * restart — which is the honest demo contract.
 *
 * Filter matching is shallow equality over the keys present in the filter,
 * which is all the repository ever issues (everything is scoped by
 * `userEmail`). It is NOT a general MongoDB query engine.
 */
import type { Db } from 'mongodb';
import { allowedUsers, demoUser } from '../config';
import { sampleProfile } from '../demo/sample-profile';

type Doc = Record<string, unknown>;

function matches(doc: Doc, filter: Doc): boolean {
	return Object.entries(filter).every(([k, v]) => doc[k] === v);
}

/** A fresh, empty in-memory Db. Exported for tests; runtime uses `getMemoryDb`. */
export function createInMemoryDb(): Db {
	const store = new Map<string, Doc[]>();
	const rows = (name: string): Doc[] => {
		let c = store.get(name);
		if (!c) {
			c = [];
			store.set(name, c);
		}
		return c;
	};

	const api = {
		collection(name: string) {
			const c = rows(name);
			return {
				async findOne(filter: Doc = {}): Promise<Doc | null> {
					return c.find((d) => matches(d, filter)) ?? null;
				},
				async insertOne(doc: Doc) {
					const copy = { ...doc };
					if (copy._id === undefined) copy._id = crypto.randomUUID();
					c.push(copy);
					return { acknowledged: true, insertedId: copy._id };
				},
				async replaceOne(filter: Doc, replacement: Doc, opts?: { upsert?: boolean }) {
					const i = c.findIndex((d) => matches(d, filter));
					if (i >= 0) {
						// Mongo treats _id as immutable across a replace: when the
						// replacement omits it, the matched row keeps its existing _id.
						const _id = replacement._id ?? c[i]._id;
						c[i] = { ...replacement, _id };
						return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
					}
					if (opts?.upsert) {
						const doc = { ...replacement };
						if (doc._id === undefined) doc._id = crypto.randomUUID();
						c.push(doc);
						return {
							acknowledged: true,
							matchedCount: 0,
							modifiedCount: 0,
							upsertedCount: 1,
							upsertedId: doc._id
						};
					}
					return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
				},
				async deleteOne(filter: Doc) {
					const i = c.findIndex((d) => matches(d, filter));
					if (i >= 0) {
						c.splice(i, 1);
						return { acknowledged: true, deletedCount: 1 };
					}
					return { acknowledged: true, deletedCount: 0 };
				},
				find(filter: Doc = {}) {
					const items = c.filter((d) => matches(d, filter));
					return { toArray: async () => items.slice() };
				}
			};
		}
	};

	return api as unknown as Db;
}

/**
 * Seed a synthetic master profile for each given email that doesn't already
 * have one. Idempotent, so re-seeding is safe. Emails are lowercased to match
 * the repository's scoping.
 */
export async function seedDemoProfiles(db: Db, emails: string[]): Promise<void> {
	const col = db.collection('profiles');
	const now = new Date();
	const unique = [...new Set(emails.map((e) => e.toLowerCase()).filter(Boolean))];
	for (const userEmail of unique) {
		const existing = await col.findOne({ userEmail });
		if (existing) continue;
		await col.insertOne({ ...sampleProfile(), userEmail, createdAt: now, updatedAt: now });
	}
}

let memoryDb: Db | undefined;

/**
 * The process-wide in-memory Db used by demo mode, created and seeded on first
 * use. Seeds a sample profile for every allow-listed user plus the demo user,
 * so whoever logs in during a demo immediately sees content to edit.
 */
export async function getMemoryDb(): Promise<Db> {
	if (!memoryDb) {
		const db = createInMemoryDb();
		await seedDemoProfiles(db, [...allowedUsers(), demoUser()]);
		memoryDb = db;
	}
	return memoryDb;
}

/** Test hook: drop the singleton so the next `getMemoryDb()` re-seeds fresh. */
export function __resetMemoryDb(): void {
	memoryDb = undefined;
}
