#!/usr/bin/env bun
/**
 * Wipe one user's data so they can start fresh — the other half of
 * `seed:workspace`, for when a tester wants their demo content gone before
 * entering real history.
 *
 * This is a HARD delete (not the app's soft-delete), because "start fresh"
 * means the row is gone, not hidden:
 *
 *   MONGODB_URI=... bun run scripts/reset-account.ts --email you@example.com --yes
 *
 * Every delete is filtered by userEmail, so it can only ever reach the named
 * user's rows — no other account is touched. Requires --yes: there is no undo,
 * and the app's own version history goes with it.
 */
import { MongoClient } from 'mongodb';
import { isDemoMode } from '../src/lib/server/config';

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg('email')?.trim().toLowerCase();
const confirmed = process.argv.includes('--yes');
const keepUser = process.argv.includes('--keep-user');

if (!email) {
	console.error('usage: bun run scripts/reset-account.ts --email <address> --yes [--keep-user]');
	process.exit(1);
}
if (!confirmed) {
	console.error(`Refusing to delete ${email}'s data without --yes. There is no undo.`);
	process.exit(1);
}
if (isDemoMode()) {
	console.error('Refusing to run: DEMO_MODE=true targets the throwaway in-memory store. Unset it.');
	process.exit(1);
}
if (!process.env.MONGODB_URI) {
	console.error('Refusing to run: MONGODB_URI is not set.');
	process.exit(1);
}

// Deliberately NOT the repository: this deletes across every collection at once,
// including soft-deleted rows the scoped accessors hide.
const COLLECTIONS = [
	'profiles',
	'profile_revisions',
	'resumes',
	'resume_revisions',
	'applications',
	'jobs'
];

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB_NAME || 'resume');

const deleted: Record<string, number> = {};
for (const name of COLLECTIONS) {
	const res = await db.collection(name).deleteMany({ userEmail: email });
	deleted[name] = res.deletedCount;
}
if (!keepUser) {
	const res = await db.collection('users').deleteMany({ email });
	deleted.users = res.deletedCount;
}

console.log(`reset ${email}:`);
for (const [name, n] of Object.entries(deleted)) console.log(`  ${name.padEnd(18)} ${n} deleted`);

// Prove the blast radius: nothing outside this user was touched.
const others = await db.collection('profiles').distinct('userEmail');
console.log(`profiles remaining for other users: ${others.filter((e) => e !== email).join(', ') || '(none)'}`);

await client.close();
