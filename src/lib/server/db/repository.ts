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
 * accessor, not re-typed at every call site. No accessor accepts a
 * caller-supplied `userEmail` override.
 *
 * `createRepository(email)` is the only entry point; construct it with the
 * identity from `event.locals.user`. For tests, pass a `DbProvider` as the
 * second argument to inject an in-memory Db and exercise the scoping without
 * a live Mongo.
 */
import type { Db, Document, Filter, OptionalUnlessRequiredId, WithId } from 'mongodb';
import { resolveDb } from './provider';
import type { ResumeDocument } from '../../resume/schema';

/**
 * Returns a connected Db. Swapped in tests; defaults to `resolveDb`, which
 * picks the real MongoDB or the in-memory demo store based on `DEMO_MODE`.
 */
export type DbProvider = () => Promise<Db>;

/** Shape shared by every row-scoped document: who it belongs to. */
export interface Scoped {
	userEmail: string;
}

export interface UserDoc extends Scoped {
	email: string;
	name?: string;
	createdAt: Date;
}

/**
 * The master profile row: a full JSON Resume document (`ResumeDocument`) plus
 * ownership and timestamps. Exactly one per user — see `ScopedProfile`.
 */
export interface ProfileDoc extends ResumeDocument, Scoped {
	createdAt: Date;
	updatedAt: Date;
}

/**
 * A generic row-scoped accessor. Every method folds `userEmail` into the
 * query/document so callers can't accidentally cross-read or cross-write
 * another user's rows.
 */
class ScopedCollection<T extends Scoped> {
	constructor(
		private readonly collectionName: string,
		private readonly userEmail: string,
		private readonly getDbFn: DbProvider
	) {}

	async findOne(filter: Filter<T> = {}): Promise<WithId<T> | null> {
		const db = await this.getDbFn();
		const scoped: Filter<T> = { ...filter, userEmail: this.userEmail } as Filter<T>;
		return db.collection<T>(this.collectionName).findOne(scoped);
	}

	async insertOne(doc: Omit<T, 'userEmail'>) {
		const db = await this.getDbFn();
		const stamped = { ...doc, userEmail: this.userEmail } as OptionalUnlessRequiredId<T>;
		return db.collection<T>(this.collectionName).insertOne(stamped);
	}
}

/**
 * The master profile is a **singleton per user**, so it gets its own accessor
 * with get/upsert semantics instead of the generic collection shape. Both
 * operations are scoped to `userEmail`; `upsert` re-stamps ownership and
 * timestamps server-side, so the client never sends (or can spoof) them.
 */
class ScopedProfile {
	private static readonly COLLECTION = 'profiles';

	constructor(
		private readonly userEmail: string,
		private readonly getDbFn: DbProvider
	) {}

	/** The user's master profile, or null if they haven't created one yet. */
	async get(): Promise<WithId<ProfileDoc> | null> {
		const db = await this.getDbFn();
		return db
			.collection<ProfileDoc>(ScopedProfile.COLLECTION)
			.findOne({ userEmail: this.userEmail });
	}

	/**
	 * Create-or-replace the user's master profile from a (already-normalized)
	 * JSON Resume document. Preserves the original `createdAt`, bumps
	 * `updatedAt`, and forces `userEmail` to this scope — the incoming `doc`
	 * cannot override ownership.
	 */
	async upsert(doc: ResumeDocument): Promise<ProfileDoc> {
		const db = await this.getDbFn();
		const col = db.collection<ProfileDoc>(ScopedProfile.COLLECTION);
		const now = new Date();
		const existing = await col.findOne({ userEmail: this.userEmail });

		const toStore: ProfileDoc = {
			...doc,
			userEmail: this.userEmail,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		};

		await col.replaceOne({ userEmail: this.userEmail }, toStore, { upsert: true });
		return toStore;
	}
}

/**
 * Repository entry point. Construct with the identity from
 * `event.locals.user` — never with a caller-supplied email — so a route
 * physically cannot request another user's scope.
 *
 * Usage in a route:
 *   const repo = createRepository(locals.user.email);
 *   const profile = await repo.profiles.get();
 */
export function createRepository(userEmail: string, getDbFn: DbProvider = resolveDb) {
	return {
		users: new ScopedCollection<UserDoc>('users', userEmail, getDbFn),
		/** The user's master profile (JSON Resume). Singleton per user. */
		profiles: new ScopedProfile(userEmail, getDbFn)
	};
}

export type Repository = ReturnType<typeof createRepository>;

// Re-exported so callers that need a raw MongoDB `Document`/filter type for
// a future collection don't need a second import from 'mongodb'.
export type { Document };
