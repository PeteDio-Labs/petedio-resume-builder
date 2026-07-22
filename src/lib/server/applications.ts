/**
 * Server-side helpers for the job/application tracker (F11). Keeps the
 * row-scoped repository the single path to Mongo and resolves the resume-link
 * relationship (application.resumeId → resume title) for the UI.
 *
 * This is a first cut — enough to get the resume↔job relationship down; the
 * full pipeline (events, dates, Q&A tab) is planned for later.
 */
import { isApplicationStatus, type ApplicationStatus } from '../applications';
import { isDemoMode } from './config';
import { createRepository } from './db/repository';

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
