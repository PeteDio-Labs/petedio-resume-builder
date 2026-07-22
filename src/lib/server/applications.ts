/**
 * Server-side helpers for the job/application tracker (F11). Keeps the
 * row-scoped repository the single path to Mongo and resolves the resume-link
 * relationship (application.resumeId → resume title) for the UI.
 *
 * This is a first cut — enough to get the resume↔job relationship down; the
 * full pipeline (events, dates, Q&A tab) is planned for later.
 */
import { isApplicationStatus, type ApplicationStatus, type QaEntry, type QaKind } from '../applications';
import { createAiProvider } from './ai/provider';
import { isDemoMode } from './config';
import { createRepository } from './db/repository';
import { emptyProfile, newId, normalizeProfile } from '../resume/schema';

export interface ApplicationView {
	id: string;
	url: string;
	label: string;
	title: string;
	company: string;
	status: ApplicationStatus;
	resumeId: string | null;
	resumeTitle: string | null;
	notes: string;
	updatedAt: string;
}

export interface ResumeOption {
	id: string;
	label: string;
}

export interface TrackInput {
	url: string;
	title: string;
	company: string;
	status: string;
	resumeId: string;
}

/** Add a scheme if the user pasted a bare host, so the link is clickable. */
export function normalizeUrl(url: string): string {
	const u = url.trim();
	if (!u) return '';
	return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/**
 * Is this something a browser can actually open?
 *
 * `"not a url"` used to be stored as `"https://not a url"` and rendered as a
 * dead link with no feedback — the tracker's whole job is the link, so a broken
 * one is a silently useless row. Parsing with the URL constructor (rather than a
 * regex) also pins the scheme to http/https: anything else — `javascript:`,
 * `data:`, `file:` — is rejected outright instead of relying on the prepend
 * above to defuse it.
 */
export function isUsableUrl(url: string): boolean {
	const normalized = normalizeUrl(url);
	if (!normalized) return false;
	let parsed: URL;
	try {
		parsed = new URL(normalized);
	} catch {
		return false;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
	// A hostname with a space or no dot isn't a real host ("not a url" parses,
	// because URL is permissive; "localhost" is fine, "not a url" is not).
	const host = parsed.hostname;
	if (!host || /\s/.test(host)) return false;
	return host === 'localhost' || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host);
}

function labelFor(app: { title: string; company: string; url: string }): string {
	if (app.title) return app.title;
	if (app.company) return app.company;
	try {
		return new URL(app.url).host;
	} catch {
		return app.url || '(untitled job)';
	}
}

export async function trackJob(email: string, input: TrackInput): Promise<void> {
	const status = isApplicationStatus(input.status) ? input.status : 'saved';
	const repo = createRepository(email);
	await repo.applications.create({
		url: normalizeUrl(input.url).slice(0, 2000),
		title: input.title.trim().slice(0, 300),
		company: input.company.trim().slice(0, 300),
		status,
		resumeId: input.resumeId || null,
		notes: ''
	});
}

export async function setApplicationStatus(email: string, id: string, status: string): Promise<void> {
	if (!isApplicationStatus(status)) return;
	const repo = createRepository(email);
	await repo.applications.update(id, { status });
}

export async function linkResume(email: string, id: string, resumeId: string): Promise<void> {
	const repo = createRepository(email);
	await repo.applications.update(id, { resumeId: resumeId || null });
}

export async function removeApplication(email: string, id: string): Promise<void> {
	const repo = createRepository(email);
	await repo.applications.softDelete(id);
}

/* ---------------- detail + Q&A (T6) ---------------- */

export interface ApplicationDetail {
	id: string;
	url: string;
	label: string;
	title: string;
	company: string;
	status: ApplicationStatus;
	resumeId: string | null;
	resumeTitle: string | null;
	qa: QaEntry[];
	hasStories: boolean;
	demo: boolean;
}

export async function getApplicationDetail(email: string, id: string): Promise<ApplicationDetail | null> {
	const repo = createRepository(email);
	const app = await repo.applications.get(id);
	if (!app) return null;
	const [resumes, profileRow] = await Promise.all([repo.resumes.list(), repo.profiles.get()]);
	const titleById = new Map(resumes.map((r) => [r.id, r.x_petedio.targetJob?.title || '(untitled resume)']));
	const stories = profileRow ? (normalizeProfile(profileRow).x_petedio.stories ?? []) : [];
	return {
		id: app.id,
		url: app.url,
		label: labelFor(app),
		title: app.title,
		company: app.company,
		status: app.status,
		resumeId: app.resumeId,
		resumeTitle: app.resumeId ? (titleById.get(app.resumeId) ?? null) : null,
		qa: app.qa ?? [],
		hasStories: stories.length > 0,
		demo: isDemoMode()
	};
}

/** Draft + save an answer to an application question (T6). */
export async function addQaAnswer(
	email: string,
	id: string,
	input: { question: string; kind: QaKind; context: string; targetChars: number }
): Promise<QaEntry | null> {
	const repo = createRepository(email);
	const app = await repo.applications.get(id);
	if (!app) return null;

	const profileRow = await repo.profiles.get();
	const profile = profileRow ? normalizeProfile(profileRow) : emptyProfile();
	const resumeRow = app.resumeId ? await repo.resumes.get(app.resumeId) : null;
	const resume = resumeRow ? normalizeProfile(resumeRow) : profile;

	const ai = createAiProvider();
	const { answer, storyId } = await ai.answerQuestion({
		question: input.question,
		kind: input.kind,
		context: input.context,
		targetChars: input.targetChars || undefined,
		resume,
		profile,
		stories: profile.x_petedio.stories ?? []
	});

	const entry: QaEntry = {
		id: newId(),
		question: input.question.slice(0, 2000),
		kind: input.kind,
		context: input.context.slice(0, 2000),
		targetChars: input.targetChars,
		storyId,
		answer,
		updatedAt: new Date().toISOString()
	};
	await repo.applications.update(id, { qa: [...(app.qa ?? []), entry] });
	return entry;
}

export async function saveQaAnswer(email: string, id: string, qaId: string, answer: string): Promise<void> {
	const repo = createRepository(email);
	const app = await repo.applications.get(id);
	if (!app) return;
	const qa = (app.qa ?? []).map((e) =>
		e.id === qaId ? { ...e, answer: answer.slice(0, 20000), updatedAt: new Date().toISOString() } : e
	);
	await repo.applications.update(id, { qa });
}

export async function deleteQaAnswer(email: string, id: string, qaId: string): Promise<void> {
	const repo = createRepository(email);
	const app = await repo.applications.get(id);
	if (!app) return;
	await repo.applications.update(id, { qa: (app.qa ?? []).filter((e) => e.id !== qaId) });
}

/** Everything the /applications page needs: the tracked jobs + the resume
 *  dropdown options, with the resume-link relationship resolved to titles. */
export async function loadApplicationsPage(email: string): Promise<{
	applications: ApplicationView[];
	resumeOptions: ResumeOption[];
	demo: boolean;
	dbError: boolean;
}> {
	const repo = createRepository(email);
	try {
		const [apps, resumes] = await Promise.all([repo.applications.list(), repo.resumes.list()]);
		const titleById = new Map(
			resumes.map((r) => [r.id, r.x_petedio.targetJob?.title || '(untitled resume)'])
		);
		return {
			applications: apps.map((a) => ({
				id: a.id,
				url: a.url,
				label: labelFor(a),
				title: a.title,
				company: a.company,
				status: a.status,
				resumeId: a.resumeId,
				resumeTitle: a.resumeId ? (titleById.get(a.resumeId) ?? null) : null,
				notes: a.notes,
				updatedAt: new Date(a.updatedAt).toISOString()
			})),
			resumeOptions: resumes.map((r) => ({
				id: r.id,
				label: `${r.x_petedio.targetJob?.title || '(untitled)'}${
					r.x_petedio.targetJob?.company ? ' — ' + r.x_petedio.targetJob.company : ''
				}`
			})),
			demo: isDemoMode(),
			dbError: false
		};
	} catch (err) {
		console.error('loadApplicationsPage: MongoDB unavailable', err);
		return { applications: [], resumeOptions: [], demo: isDemoMode(), dbError: true };
	}
}
