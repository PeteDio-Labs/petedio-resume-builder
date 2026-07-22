#!/usr/bin/env bun
/**
 * Seed a master profile into the real database.
 *
 * The profile JSON is passed as a FILE PATH and is never committed — this repo is
 * public and must not contain anyone's real work history (see CLAUDE.md). Export
 * the JSON block from the Linear "Sonia — Master Profile Seed" doc to a local file
 * and point this at it.
 *
 *   MONGODB_URI=... bun run seed -- --file ~/sonia-profile.json --email soniasdelgadillo@gmail.com
 *
 * Idempotent: re-running replaces the master profile for that email (the repository
 * upsert is row-scoped, so it can only ever touch that user's row).
 *
 * The input is tolerated as JSONC — the seed doc's block carries `//` comments.
 */
import { readFileSync } from 'node:fs';
import { normalizeProfile } from '../src/lib/resume/schema';
import { isDemoMode } from '../src/lib/server/config';
import { closeDb } from '../src/lib/server/db/client';
import { createRepository } from '../src/lib/server/db/repository';

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Strip `//` line comments that aren't inside a string literal. */
function stripJsonComments(src: string): string {
	let out = '';
	let inStr = false;
	let escaped = false;
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (inStr) {
			out += c;
			if (escaped) escaped = false;
			else if (c === '\\') escaped = true;
			else if (c === '"') inStr = false;
			continue;
		}
		if (c === '"') {
			inStr = true;
			out += c;
			continue;
		}
		if (c === '/' && src[i + 1] === '/') {
			while (i < src.length && src[i] !== '\n') i++;
			out += '\n';
			continue;
		}
		out += c;
	}
	// Trailing commas left behind by removed comments.
	return out.replace(/,(\s*[}\]])/g, '$1');
}

const file = arg('file');
const email = arg('email')?.trim().toLowerCase();
const dryRun = process.argv.includes('--dry-run');

if (!file || !email) {
	console.error('usage: bun run seed -- --file <profile.json> --email <address> [--dry-run]');
	process.exit(1);
}

let profile;
try {
	profile = normalizeProfile(JSON.parse(stripJsonComments(readFileSync(file, 'utf8'))));
} catch (err) {
	console.error(`Could not parse ${file}:`, err instanceof Error ? err.message : err);
	process.exit(1);
}

// --dry-run validates the file and prints what WOULD be written. No DB, no env needed.
if (dryRun) {
	console.log(
		`[dry-run] would seed ${email}: ${profile.basics.name || '(no name)'} · ` +
			`${profile.work.length} roles · ${profile.education.length} education · ` +
			`${profile.skills.length} skill groups · ${profile.x_petedio.stories?.length ?? 0} stories`
	);
	for (const w of profile.work) {
		console.log(`  · ${w.position || '?'} @ ${w.name || '?'} (${w.startDate || '?'}–${w.endDate || '?'}) — ${w.highlights.length} bullets`);
	}
	process.exit(0);
}

if (isDemoMode()) {
	console.error('Refusing to seed: DEMO_MODE=true writes to the throwaway in-memory store. Unset it.');
	process.exit(1);
}
if (!process.env.MONGODB_URI) {
	console.error('Refusing to seed: MONGODB_URI is not set.');
	process.exit(1);
}

const repo = createRepository(email);

if (!(await repo.users.findOne({}))) {
	await repo.users.insertOne({ email, createdAt: new Date() });
	console.log(`created users row for ${email}`);
}

const saved = await repo.profiles.upsert(profile);
const stories = saved.x_petedio.stories?.length ?? 0;

console.log(
	`seeded master profile for ${saved.userEmail}: ` +
		`${saved.basics.name || '(no name)'} · ${saved.work.length} roles · ` +
		`${saved.education.length} education · ${saved.skills.length} skill groups · ${stories} stories`
);
if (stories === 0) {
	console.warn('note: story bank is empty — behavioral Q&A answers will be thin until stories are added.');
}
if (!saved.basics.label) {
	console.warn('note: basics.label (target title) is empty — ATS title-match scoring will be weaker.');
}

await closeDb();
