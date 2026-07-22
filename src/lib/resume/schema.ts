/**
 * JSON Resume v1.x types + the PeteDio `x_petedio` extension.
 *
 * The canonical resume format for this app is **JSON Resume v1.x**
 * (jsonresume.org) — we don't invent a schema. Every master profile and every
 * tailored resume is one of these documents. The schema is
 * `additionalProperties: true`, so all app-specific metadata lives under a
 * single namespaced key, `x_petedio`, and never pollutes the standard fields
 * (which is what keeps exported PDFs / third-party tooling happy).
 *
 * These interfaces mirror the well-known JSON Resume field names. They're a
 * faithful subset — every section the schema defines is here — typed loosely
 * enough (all fields optional) that a partially-filled draft from the
 * paste-import parser is still a valid `ResumeDocument`.
 *
 * Runtime-neutral: no `Bun.*`, only Web-standard `crypto.randomUUID()`.
 */

/* ------------------------------------------------------------------ *
 * Standard JSON Resume sections
 * ------------------------------------------------------------------ */

export interface Location {
	address?: string;
	postalCode?: string;
	city?: string;
	countryCode?: string;
	region?: string;
}

export interface Profile {
	network?: string;
	username?: string;
	url?: string;
}

export interface Basics {
	name?: string;
	/** Headline / target title — e.g. "Talent Acquisition Partner". */
	label?: string;
	image?: string;
	email?: string;
	phone?: string;
	url?: string;
	summary?: string;
	location?: Location;
	profiles?: Profile[];
}

export interface WorkItem {
	name?: string;
	location?: string;
	description?: string;
	position?: string;
	url?: string;
	/** ISO-ish date, typically "YYYY-MM" or "YYYY-MM-DD". */
	startDate?: string;
	endDate?: string;
	summary?: string;
	/** Required (defaults to []) so the editor can bind it directly. */
	highlights: string[];
}

export interface VolunteerItem {
	organization?: string;
	position?: string;
	url?: string;
	startDate?: string;
	endDate?: string;
	summary?: string;
	highlights?: string[];
}

export interface EducationItem {
	institution?: string;
	url?: string;
	area?: string;
	studyType?: string;
	startDate?: string;
	endDate?: string;
	score?: string;
	courses?: string[];
}

export interface AwardItem {
	title?: string;
	date?: string;
	awarder?: string;
	summary?: string;
}

export interface CertificateItem {
	name?: string;
	date?: string;
	issuer?: string;
	url?: string;
}

export interface PublicationItem {
	name?: string;
	publisher?: string;
	releaseDate?: string;
	url?: string;
	summary?: string;
}

export interface SkillItem {
	name?: string;
	level?: string;
	/** Required (defaults to []) so the editor can bind it directly. */
	keywords: string[];
}

export interface LanguageItem {
	language?: string;
	fluency?: string;
}

export interface InterestItem {
	name?: string;
	keywords?: string[];
}

export interface ReferenceItem {
	name?: string;
	reference?: string;
}

export interface ProjectItem {
	name?: string;
	description?: string;
	/** Required (defaults to []) so the editor can bind it directly. */
	highlights: string[];
	/** Required (defaults to []) so the editor can bind it directly. */
	keywords: string[];
	startDate?: string;
	endDate?: string;
	url?: string;
	roles?: string[];
	entity?: string;
	type?: string;
}

export interface ResumeMeta {
	canonical?: string;
	version?: string;
	lastModified?: string;
}

/* ------------------------------------------------------------------ *
 * x_petedio extension
 * ------------------------------------------------------------------ */

/** STAR-shaped tags used to auto-match a story to a behavioral question. */
export type StoryTag =
	| 'conflict'
	| 'leadership'
	| 'failure'
	| 'deadline'
	| 'initiative'
	| 'teamwork';

export const STORY_TAGS: StoryTag[] = [
	'conflict',
	'leadership',
	'failure',
	'deadline',
	'initiative',
	'teamwork'
];

/**
 * A reusable STAR anecdote in the story bank. These are the raw material for
 * application Q&A behavioral answers (feature F14). Lives on the master
 * profile under `x_petedio.stories`.
 */
export interface Story {
	id: string;
	title: string;
	tags: StoryTag[];
	situation: string;
	task: string;
	action: string;
	result: string;
	metrics: string;
	/** Application ids this anecdote has already been used for. */
	usedIn: string[];
}

export type ResumeStatus = 'draft' | 'tailored' | 'submitted' | 'archived';
export type KeywordKind = 'hard' | 'soft' | 'cert' | 'title' | 'edu';

export interface ExtractedKeyword {
	term: string;
	aliases: string[];
	kind: KeywordKind;
	weight: number;
}

export interface ResumeComment {
	at: string;
	path: string;
	range: [number, number];
	text: string;
	resolved: boolean;
}

/**
 * PeteDio-namespaced metadata. On a **master profile** only `schemaVersion`
 * and `stories` are meaningful; the tailoring fields (targetJob, keywords,
 * atsScore, lineage, comments, coverLetter) are populated on derived,
 * per-job resumes in later phases. All optional so a bare profile is valid.
 */
export interface XPetedio {
	schemaVersion: '1';
	stories?: Story[];
	targetJob?: {
		title?: string;
		company?: string;
		url?: string;
		jdText?: string;
		capturedAt?: string;
	};
	keywords?: {
		extracted?: ExtractedKeyword[];
		matched?: string[];
		missing?: string[];
	};
	atsScore?: {
		total?: number;
		components?: Record<string, number>;
		computedAt?: string;
	};
	lineage?: {
		parentId?: string | null;
		baseProfileId?: string;
		sectionSources?: Record<string, string>;
	};
	comments?: ResumeComment[];
	status?: ResumeStatus;
	coverLetter?: {
		text?: string;
		generatedFrom?: string;
	};
}

/**
 * A full document: a standard JSON Resume plus the `x_petedio` extension.
 * Used for both the master profile and (later) tailored resumes.
 */
export interface ResumeDocument {
	basics: Basics;
	work: WorkItem[];
	volunteer: VolunteerItem[];
	education: EducationItem[];
	awards: AwardItem[];
	certificates: CertificateItem[];
	publications: PublicationItem[];
	skills: SkillItem[];
	languages: LanguageItem[];
	interests: InterestItem[];
	references: ReferenceItem[];
	projects: ProjectItem[];
	meta?: ResumeMeta;
	x_petedio: XPetedio;
}

/* ------------------------------------------------------------------ *
 * Factories
 * ------------------------------------------------------------------ */

/** A short, collision-resistant id (Web-standard, runtime-neutral). */
export function newId(): string {
	return crypto.randomUUID();
}

/** A blank, well-formed master profile — every array present and empty. */
export function emptyProfile(): ResumeDocument {
	return {
		basics: { name: '', label: '', email: '', phone: '', url: '', summary: '', profiles: [] },
		work: [],
		volunteer: [],
		education: [],
		awards: [],
		certificates: [],
		publications: [],
		skills: [],
		languages: [],
		interests: [],
		references: [],
		projects: [],
		x_petedio: { schemaVersion: '1', stories: [] }
	};
}

/** A blank story with a fresh id, ready for the story-bank editor. */
export function newStory(): Story {
	return {
		id: newId(),
		title: '',
		tags: [],
		situation: '',
		task: '',
		action: '',
		result: '',
		metrics: '',
		usedIn: []
	};
}

export function newWorkItem(): WorkItem {
	return { name: '', position: '', location: '', startDate: '', endDate: '', summary: '', highlights: [] };
}

export function newEducationItem(): EducationItem {
	return { institution: '', area: '', studyType: '', startDate: '', endDate: '' };
}

export function newSkillItem(): SkillItem {
	return { name: '', keywords: [] };
}

export function newCertificateItem(): CertificateItem {
	return { name: '', issuer: '', date: '' };
}

export function newProjectItem(): ProjectItem {
	return { name: '', description: '', url: '', highlights: [], keywords: [] };
}

/* ------------------------------------------------------------------ *
 * Normalization / validation
 * ------------------------------------------------------------------ */

// Defensive caps. This app is single-user, but the save action accepts a
// client-supplied JSON blob, so we bound it rather than trust it.
const MAX_STRING = 20_000;
const MAX_ARRAY = 500;
const MAX_KEYWORDS = 200;

function str(v: unknown, max = MAX_STRING): string {
	if (typeof v !== 'string') return '';
	return v.length > max ? v.slice(0, max) : v;
}

function optStr(v: unknown, max = MAX_STRING): string | undefined {
	if (typeof v !== 'string' || v === '') return undefined;
	return str(v, max);
}

function strArr(v: unknown, maxItems = MAX_ARRAY): string[] {
	if (!Array.isArray(v)) return [];
	return v
		.slice(0, maxItems)
		.map((x) => str(x, 4_000))
		.filter((x) => x.trim() !== '');
}

function arr<T>(v: unknown, map: (item: Record<string, unknown>) => T, maxItems = MAX_ARRAY): T[] {
	if (!Array.isArray(v)) return [];
	return v
		.slice(0, maxItems)
		.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
		.map(map);
}

function obj(v: unknown): Record<string, unknown> {
	return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function normalizeLocation(v: unknown): Location | undefined {
	const l = obj(v);
	const out: Location = {
		address: optStr(l.address),
		postalCode: optStr(l.postalCode),
		city: optStr(l.city),
		countryCode: optStr(l.countryCode),
		region: optStr(l.region)
	};
	return Object.values(out).some((x) => x !== undefined) ? out : undefined;
}

function normalizeBasics(v: unknown): Basics {
	const b = obj(v);
	return {
		name: str(b.name, 300),
		label: str(b.label, 300),
		image: optStr(b.image, 2_000),
		email: str(b.email, 300),
		phone: str(b.phone, 100),
		url: str(b.url, 2_000),
		summary: str(b.summary),
		location: normalizeLocation(b.location),
		profiles: arr(b.profiles, (p) => ({
			network: str(p.network, 100),
			username: optStr(p.username, 200),
			url: str(p.url, 2_000)
		}))
	};
}

function normalizeStory(v: Record<string, unknown>): Story {
	const rawTags = Array.isArray(v.tags) ? v.tags : [];
	const tags = rawTags.filter((t): t is StoryTag => STORY_TAGS.includes(t as StoryTag));
	return {
		id: optStr(v.id, 100) ?? newId(),
		title: str(v.title, 300),
		tags,
		situation: str(v.situation),
		task: str(v.task),
		action: str(v.action),
		result: str(v.result),
		metrics: str(v.metrics, 2_000),
		usedIn: strArr(v.usedIn)
	};
}

function normalizeXPetedio(v: unknown): XPetedio {
	const x = obj(v);
	const out: XPetedio = {
		schemaVersion: '1',
		stories: arr(x.stories, normalizeStory)
	};
	// Carry through tailoring metadata untouched if present (shape validated in
	// later phases when those features land) — but only known top-level keys.
	if (x.status && typeof x.status === 'string') {
		const s = x.status as ResumeStatus;
		if (['draft', 'tailored', 'submitted', 'archived'].includes(s)) out.status = s;
	}
	if (typeof x.targetJob === 'object' && x.targetJob !== null) {
		const t = obj(x.targetJob);
		out.targetJob = {
			title: optStr(t.title, 300),
			company: optStr(t.company, 300),
			url: optStr(t.url, 2_000),
			jdText: optStr(t.jdText, 50_000),
			capturedAt: optStr(t.capturedAt, 100)
		};
	}
	return out;
}

/**
 * Coerce arbitrary (untrusted) input into a well-formed `ResumeDocument`.
 *
 * This is the single validation boundary between the client and Mongo: the
 * `/profile` save action hands whatever JSON the browser posted to this
 * function, and only known fields in known shapes come out. Unknown top-level
 * keys are dropped; over-long strings/arrays are capped. Missing sections
 * become empty arrays, so the result is always safe to render and store.
 */
export function normalizeProfile(input: unknown): ResumeDocument {
	const d = obj(input);
	return {
		basics: normalizeBasics(d.basics),
		work: arr(d.work, (w) => ({
			name: str(w.name, 300),
			position: str(w.position, 300),
			location: str(w.location, 300),
			description: optStr(w.description, 2_000),
			url: optStr(w.url, 2_000),
			startDate: str(w.startDate, 40),
			endDate: str(w.endDate, 40),
			summary: str(w.summary),
			highlights: strArr(w.highlights)
		})),
		volunteer: arr(d.volunteer, (v) => ({
			organization: str(v.organization, 300),
			position: str(v.position, 300),
			url: optStr(v.url, 2_000),
			startDate: str(v.startDate, 40),
			endDate: str(v.endDate, 40),
			summary: str(v.summary),
			highlights: strArr(v.highlights)
		})),
		education: arr(d.education, (e) => ({
			institution: str(e.institution, 300),
			url: optStr(e.url, 2_000),
			area: str(e.area, 300),
			studyType: str(e.studyType, 200),
			startDate: str(e.startDate, 40),
			endDate: str(e.endDate, 40),
			score: optStr(e.score, 100),
			courses: strArr(e.courses)
		})),
		awards: arr(d.awards, (a) => ({
			title: str(a.title, 300),
			date: str(a.date, 40),
			awarder: str(a.awarder, 300),
			summary: str(a.summary)
		})),
		certificates: arr(d.certificates, (c) => ({
			name: str(c.name, 300),
			date: str(c.date, 40),
			issuer: str(c.issuer, 300),
			url: optStr(c.url, 2_000)
		})),
		publications: arr(d.publications, (p) => ({
			name: str(p.name, 300),
			publisher: str(p.publisher, 300),
			releaseDate: str(p.releaseDate, 40),
			url: optStr(p.url, 2_000),
			summary: str(p.summary)
		})),
		skills: arr(d.skills, (s) => ({
			name: str(s.name, 300),
			level: optStr(s.level, 100),
			keywords: strArr(s.keywords, MAX_KEYWORDS)
		})),
		languages: arr(d.languages, (l) => ({
			language: str(l.language, 200),
			fluency: str(l.fluency, 200)
		})),
		interests: arr(d.interests, (i) => ({
			name: str(i.name, 200),
			keywords: strArr(i.keywords, MAX_KEYWORDS)
		})),
		references: arr(d.references, (r) => ({
			name: str(r.name, 300),
			reference: str(r.reference)
		})),
		projects: arr(d.projects, (p) => ({
			name: str(p.name, 300),
			description: str(p.description),
			highlights: strArr(p.highlights),
			keywords: strArr(p.keywords, MAX_KEYWORDS),
			startDate: str(p.startDate, 40),
			endDate: str(p.endDate, 40),
			url: optStr(p.url, 2_000),
			roles: strArr(p.roles),
			entity: optStr(p.entity, 300),
			type: optStr(p.type, 100)
		})),
		x_petedio: normalizeXPetedio(d.x_petedio)
	};
}
