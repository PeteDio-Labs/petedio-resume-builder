/**
 * Server-side master-profile helpers, shared by `/profile` and
 * `/profile/import`. Keeps the row-scoped repository the single path to Mongo
 * and centralises the "DB might not be provisioned yet" handling so both
 * routes behave the same.
 */
import { createRepository } from './db/repository';
import { isDemoMode } from './config';
import { emptyProfile, normalizeProfile, type ResumeDocument } from '../resume/schema';

export interface LoadedProfile {
	/** Always a valid, editable doc — empty if none stored (or DB is down). */
	profile: ResumeDocument;
	/** True if a saved master profile was found. */
	exists: boolean;
	/** ISO timestamp of the last save, or null. */
	updatedAt: string | null;
	/** True if Mongo couldn't be reached — the editor still renders, read-only-ish. */
	dbError: boolean;
	/** True when running against the in-memory demo store (data resets on restart). */
	demo: boolean;
	/** Past versions, newest first — the undo path for a bad save/import (UAT H3). */
	revisions: { rev: number; label: string; savedAt: string }[];
}

/**
 * Load a user's master profile, resiliently. If Mongo isn't reachable yet
 * (it isn't provisioned during early P2), we still return an empty editable
 * profile and flag `dbError` so the UI can warn that saves won't persist —
 * rather than 500-ing the whole page.
 */
export async function loadMasterProfile(email: string): Promise<LoadedProfile> {
	const repo = createRepository(email);
	try {
		const [stored, revs] = await Promise.all([repo.profiles.get(), repo.profiles.listRevisions()]);
		return {
			// normalizeProfile also strips Mongo-only fields (_id, userEmail,
			// timestamps) so what reaches the client is a clean JSON Resume doc.
			profile: stored ? normalizeProfile(stored) : emptyProfile(),
			exists: Boolean(stored),
			updatedAt: stored?.updatedAt ? new Date(stored.updatedAt).toISOString() : null,
			dbError: false,
			demo: isDemoMode(),
			revisions: revs.map((r) => ({
				rev: r.rev,
				label: r.label,
				savedAt: new Date(r.savedAt).toISOString()
			}))
		};
	} catch (err) {
		console.error('loadMasterProfile: MongoDB unavailable', err);
		return { profile: emptyProfile(), exists: false, updatedAt: null, dbError: true, demo: isDemoMode(), revisions: [] };
	}
}

export class InvalidProfileError extends Error {}

/**
 * Validate + persist a master profile from a client-supplied JSON string.
 * Throws `InvalidProfileError` on malformed JSON (→ 400) and rethrows any
 * driver error (→ 503) so the caller can map it to the right form failure.
 */
export async function saveMasterProfile(email: string, docJson: string, label = 'Saved'): Promise<string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(docJson);
	} catch {
		throw new InvalidProfileError('Profile data was not valid JSON.');
	}

	const clean = normalizeProfile(parsed);
	const repo = createRepository(email);
	const saved = await repo.profiles.upsert(clean, label);
	return new Date(saved.updatedAt).toISOString();
}

/** Roll the master profile back to a previous version (UAT H3). */
export async function restoreProfileRevision(email: string, rev: number): Promise<boolean> {
	return createRepository(email).profiles.restoreRevision(rev);
}
