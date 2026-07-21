/**
 * Row-scoped repository layer.
 *
 * IMPORTANT: routes must NEVER touch MongoDB collections directly (no
 * `import { getDb } from './client'` in +page.server.ts / +server.ts). Every
 * DB access goes through a scope created here, because every read/write in
 * this app must be scoped to the signed-in user's rows. Going straight to
 * the driver means someone eventually forgets a `{ userEmail }` filter and
 * one user's rows leak into another's request — this layer exists so that
 * mistake is structurally impossible: the filter is baked into the
 * accessor, not re-typed at every call site.
 *
 * This is a skeleton for P1 — one example collection (`users`) with
 * `findOne`/`insertOne` wrappers to demonstrate the pattern. Later
 * collections (resumes, job descriptions, generations, ...) should follow
 * the same shape: every method takes/returns data already scoped to
 * `userEmail`, and no method accepts a caller-supplied `userEmail` override.
 */
import type { Document, Filter, OptionalUnlessRequiredId, WithId } from 'mongodb';
import { getDb } from './client';

/** Shape shared by every row-scoped document: who it belongs to. */
export interface Scoped {
	userEmail: string;
}

export interface UserDoc extends Scoped {
	email: string;
	createdAt: Date;
}

/**
 * A row-scoped accessor for one collection. Every method folds `userEmail`
 * into the query/document so callers can't accidentally cross-read or
 * cross-write another user's rows.
 */
class ScopedCollection<T extends Scoped> {
	constructor(
		private readonly collectionName: string,
		private readonly userEmail: string
	) {}

	async findOne(filter: Filter<T> = {}): Promise<WithId<T> | null> {
		const db = await getDb();
		const scoped: Filter<T> = { ...filter, userEmail: this.userEmail } as Filter<T>;
		return db.collection<T>(this.collectionName).findOne(scoped);
	}

	async insertOne(doc: Omit<T, 'userEmail'>) {
		const db = await getDb();
		const stamped = { ...doc, userEmail: this.userEmail } as OptionalUnlessRequiredId<T>;
		return db.collection<T>(this.collectionName).insertOne(stamped);
	}
}

/**
 * Repository entry point. Construct with the identity from
 * `event.locals.user` — never with a caller-supplied email — so a route
 * physically cannot request another user's scope.
 *
 * Usage in a route: `const repo = createRepository(locals.user.email);`
 * then `repo.users.findOne(...)` / `repo.users.insertOne(...)`.
 */
export function createRepository(userEmail: string) {
	return {
		// Example collection demonstrating the pattern. Add further
		// `ScopedCollection` instances here as real collections land —
		// each one enforces the same userEmail scoping automatically.
		users: new ScopedCollection<UserDoc>('users', userEmail)
	};
}

export type Repository = ReturnType<typeof createRepository>;

// Re-exported so callers that need a raw MongoDB `Document`/filter type for
// a future collection don't need a second import from 'mongodb'.
export type { Document };
