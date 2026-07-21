/**
 * MongoDB client singleton — lazy-connect.
 *
 * Mongo isn't provisioned yet for this project (P1 scope, PET "Resume
 * Builder" planning doc in Linear), so this file only wires up the driver;
 * nothing here is exercised until MONGODB_URI points at a real cluster.
 *
 * Routes must NEVER import this directly — go through `repository.ts`,
 * which is the only place allowed to touch a raw collection. See that
 * file's header comment for why.
 */
import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | undefined;
let db: Db | undefined;

/**
 * Returns a connected `Db` handle, connecting lazily on first call.
 * Reads `MONGODB_URI` (and optional `MONGODB_DB_NAME`) from env — throws if
 * `MONGODB_URI` is unset, since there's no sane default to fall back to.
 */
export async function getDb(): Promise<Db> {
	if (db) return db;

	const uri = process.env.MONGODB_URI;
	if (!uri) {
		throw new Error('MONGODB_URI is not set — see .env.example');
	}

	client = new MongoClient(uri);
	await client.connect();
	db = client.db(process.env.MONGODB_DB_NAME || undefined);
	return db;
}

/** For graceful shutdown / tests — closes the singleton connection, if any. */
export async function closeDb(): Promise<void> {
	await client?.close();
	client = undefined;
	db = undefined;
}
