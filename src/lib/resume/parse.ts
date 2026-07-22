/**
 * Deterministic paste-import parser: raw resume text → draft JSON Resume doc.
 *
 * This is intentionally *not* an AI feature. The plan's Ollama task list
 * (T1–T6) doesn't include import-parse — it's a heuristic pass whose only job
 * is to save the user typing everything from scratch. The result is always
 * reviewed and corrected in the editor before it's saved, so "best effort" is
 * the right bar: extract what we can confidently, hand the rest back as
 * warnings, and never throw.
 *
 * Tuned for the common single-column resume shape (contact header, then
 * SUMMARY / EXPERIENCE / EDUCATION / SKILLS / CERTIFICATIONS / PROJECTS
 * sections with `•`/`-` bullets), which is also what our PDF export produces.
 * Markdown emphasis (`**bold**`) is tolerated since pasted text often carries
 * it. Everything is a pure function — no I/O, no Bun/Node APIs.
 */
import {
	emptyProfile,
	newProjectItem,
	newWorkItem,
	type CertificateItem,
	type EducationItem,
	type LanguageItem,
	type ProjectItem,
	type ResumeDocument,
	type SkillItem,
	type WorkItem
} from './schema';

export interface ParseResult {
	doc: ResumeDocument;
	/** Human-readable notes about what couldn't be confidently parsed. */
	warnings: string[];
}

type Section =
	| 'summary'
	| 'experience'
	| 'education'
	| 'skills'
	| 'certificates'
	| 'projects'
	| 'languages'
	| 'other';

/* ------------------------------------------------------------------ *
 * Small text utilities
 * ------------------------------------------------------------------ */

const BULLET_RE = /^\s*[•\-*▪·◦‣o]\s+/;

/** Strip markdown emphasis, leading heading hashes, and surrounding space. */
function clean(line: string): string {
	return line
		.replace(/\*\*/g, '')
		.replace(/^\s*#+\s*/, '')
		.replace(/^\s+|\s+$/g, '');
}

function isBullet(line: string): boolean {
	return BULLET_RE.test(line);
}

function stripBullet(line: string): string {
	return clean(line.replace(BULLET_RE, ''));
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const MONTHS: Record<string, string> = {
	january: '01', jan: '01',
	february: '02', feb: '02',
	march: '03', mar: '03',
	april: '04', apr: '04',
	may: '05',
	june: '06', jun: '06',
	july: '07', jul: '07',
	august: '08', aug: '08',
	september: '09', sep: '09', sept: '09',
	october: '10', oct: '10',
	november: '11', nov: '11',
	december: '12', dec: '12'
};

/** Normalize a single date token to "YYYY-MM", "YYYY", or "Present". */
function parseDate(token: string): string {
	const t = token.trim().replace(/\.$/, '');
	if (/^(present|current|now|ongoing|to date)$/i.test(t)) return 'Present';

	let m = t.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/); // ISO
	if (m) return `${m[1]}-${m[2]}`;

	m = t.match(/^(\d{1,2})\/(\d{4})$/); // MM/YYYY
	if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;

	m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/); // Month YYYY
	if (m) {
		const mm = MONTHS[m[1].toLowerCase()] ?? MONTHS[m[1].toLowerCase().slice(0, 3)];
		if (mm) return `${m[2]}-${mm}`;
	}

	m = t.match(/^(\d{4})$/); // bare year
	if (m) return m[1];

	return '';
}

const DATE_TOKEN =
	'(?:present|current|now|ongoing|to date|[A-Za-z]{3,9}\\.?\\s+\\d{4}|\\d{4}-\\d{2}(?:-\\d{2})?|\\d{1,2}\\/\\d{4}|\\d{4})';
const RANGE_RE = new RegExp(
	`(${DATE_TOKEN})\\s*(?:-|–|—|to|through|until|~)\\s*(${DATE_TOKEN})`,
	'i'
);

/** Pull a start/end date range out of a line; returns dates + the line minus the range. */
function extractDateRange(line: string): { startDate: string; endDate: string; rest: string } {
	const m = line.match(RANGE_RE);
	if (!m) return { startDate: '', endDate: '', rest: line };
	const rest = (line.slice(0, m.index) + line.slice((m.index ?? 0) + m[0].length))
		// Removing a bracketed date leaves empty delimiters behind ("Acme ()").
		.replace(/\(\s*\)|\[\s*\]/g, '')
		.replace(/[—–|,·•\-]\s*$/, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
	return { startDate: parseDate(m[1]), endDate: parseDate(m[2]), rest };
}

/* ------------------------------------------------------------------ *
 * Contact / header block
 * ------------------------------------------------------------------ */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?[\w-]+\.[\w.-]+(?:\/[\w#!:.?+=&%@\-/]*)?/i;
// A token is only treated as the personal website when the WHOLE token is a
// URL/domain — so multi-word tech tokens like "Node.js Developer" (which
// URL_RE would otherwise partially match as "Node.js") are not mistaken for a
// website.
const WEBSITE_RE = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i;
// Contact regexes can backtrack quadratically on a very long run of word
// characters with no match, so bound the text they run on. A real contact
// header line fits comfortably.
const MAX_HEADER_LINE = 400;

function looksLikeName(token: string): boolean {
	const t = clean(token);
	if (!t || t.length > 60) return false;
	if (EMAIL_RE.test(t) || PHONE_RE.test(t)) return false;
	if (/\d/.test(t)) return false;
	const words = t.split(/\s+/);
	if (words.length < 1 || words.length > 5) return false;
	// Mostly capitalized words, no sentence punctuation.
	return /^[A-Za-zÀ-ÿ'.\- ]+$/.test(t);
}

/**
 * Parse the top-of-resume header: name + contact tokens separated by
 * `•`/`|`/`·` or spread across the first few lines.
 */
function parseHeader(lines: string[], doc: ResumeDocument, warnings: string[]): void {
	const headerLines = lines
		.slice(0, 8)
		.map((l) => clean(l).slice(0, MAX_HEADER_LINE))
		.filter(Boolean);
	const wholeTop = headerLines.join(' • ');

	const email = wholeTop.match(EMAIL_RE)?.[0] ?? '';
	if (email) doc.basics.email = email;

	const phone = wholeTop.match(PHONE_RE)?.[0] ?? '';
	if (phone) doc.basics.phone = phone.trim();

	// URLs: classify LinkedIn / personal site.
	const tokens = headerLines.flatMap((l) => l.split(/[•|·]/)).map((t) => t.trim()).filter(Boolean);
	for (const tok of tokens) {
		const url = tok.match(URL_RE)?.[0];
		if (!url) continue;
		if (/linkedin\.com/i.test(url)) {
			doc.basics.profiles = doc.basics.profiles ?? [];
			if (!doc.basics.profiles.some((p) => p.network === 'LinkedIn')) {
				doc.basics.profiles.push({ network: 'LinkedIn', url });
			}
		} else if (/github\.com/i.test(url)) {
			doc.basics.profiles = doc.basics.profiles ?? [];
			doc.basics.profiles.push({ network: 'GitHub', url });
		} else if (!EMAIL_RE.test(tok) && !doc.basics.url && WEBSITE_RE.test(tok.trim())) {
			doc.basics.url = url;
		}
	}

	// Name: first header token that looks like a person's name.
	for (const tok of tokens) {
		if (looksLikeName(tok)) {
			doc.basics.name = clean(tok);
			break;
		}
	}
	if (!doc.basics.name && headerLines[0] && looksLikeName(headerLines[0])) {
		doc.basics.name = headerLines[0];
	}

	// Location: a "City, ST" token, or a short all-letters locale like "NYC"/"Remote".
	for (const tok of tokens) {
		const t = clean(tok);
		if (EMAIL_RE.test(t) || PHONE_RE.test(t) || URL_RE.test(t) || t === doc.basics.name) continue;
		const cityState = t.match(/^([A-Za-z .'-]+),\s*([A-Za-z]{2})$/);
		if (cityState) {
			doc.basics.location = { city: cityState[1].trim(), region: cityState[2].trim() };
			break;
		}
		if (/^(nyc|remote|[A-Za-z .'-]{2,20})$/i.test(t) && t.length <= 20 && !doc.basics.location) {
			// Weak signal — only accept short single tokens that aren't the name.
			if (/^(nyc|remote)$/i.test(t)) {
				doc.basics.location = { city: t.toUpperCase() === 'NYC' ? 'New York' : t };
			}
		}
	}

	if (!doc.basics.name) warnings.push('Could not confidently detect a name — set it manually.');
}

/* ------------------------------------------------------------------ *
 * Section segmentation
 * ------------------------------------------------------------------ */

const HEADER_PHRASES: Array<[Section, RegExp]> = [
	['summary', /^(professional\s+summary|summary|profile|objective|about( me)?)$/i],
	[
		'experience',
		/(^|\b)(work\s+experience|professional\s+experience|employment(\s+history)?|work\s+history|experience|relevant\s+experience|recruiting\s+experience|project\s+management\s+experience)($|\b)/i
	],
	['education', /^(education|academic( background)?)$/i],
	['skills', /^(skills|technical\s+skills|skills[, ].*|tools|competencies|expertise|core\s+competencies)$/i],
	['certificates', /^(certifications?|certificates?|licenses?( & certifications?)?)$/i],
	['projects', /^(projects|personal\s+projects|selected\s+projects|key\s+projects)$/i],
	['languages', /^(languages)$/i]
];

/** Classify a line as a section header, or null if it's body content. */
function classifyHeader(rawLine: string): Section | null {
	const line = clean(rawLine).replace(/:$/, '').trim();
	if (!line || line.length > 45 || isBullet(rawLine)) return null;

	const words = line.split(/\s+/);
	// Header-like: short, and not ending in sentence punctuation.
	const headerLike = words.length <= 6 && !/[.!?]$/.test(line);
	if (!headerLike) return null;

	for (const [section, re] of HEADER_PHRASES) {
		if (re.test(line)) return section;
	}
	return null;
}

interface Block {
	section: Section;
	title: string;
	lines: string[];
}

function segment(lines: string[], headerEndIdx: number): Block[] {
	const blocks: Block[] = [];
	let current: Block | null = null;

	for (let i = headerEndIdx; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === '') continue;

		const section = classifyHeader(line);
		if (section) {
			current = { section, title: clean(line), lines: [] };
			blocks.push(current);
		} else if (current) {
			current.lines.push(line);
		}
	}
	return blocks;
}

/* ------------------------------------------------------------------ *
 * Per-section parsers
 * ------------------------------------------------------------------ */

// Words that mark a chunk as a JOB TITLE rather than a company name. Resumes are
// written both ways ("Position, Company" and "Company — Position"), and assuming
// one order silently swapped the fields for the other (UAT H4).
const TITLE_WORDS = new Set([
	'manager', 'engineer', 'coordinator', 'associate', 'director', 'recruiter', 'analyst',
	'designer', 'developer', 'lead', 'specialist', 'consultant', 'president', 'officer',
	'head', 'architect', 'scientist', 'administrator', 'assistant', 'supervisor', 'partner',
	'principal', 'intern', 'technician', 'strategist', 'writer', 'editor', 'producer',
	'representative', 'agent', 'advisor', 'controller', 'chief', 'founder', 'owner',
	'sourcer', 'generalist', 'operations', 'marketing', 'sales', 'support', 'staff',
	'senior', 'junior', 'vp', 'cto', 'ceo', 'cfo', 'coo', 'pm', 'swe'
]);

function hasTitleWord(s: string): boolean {
	return s
		.toLowerCase()
		.split(/[^a-z]+/)
		.some((w) => TITLE_WORDS.has(w));
}

/** A line that is nothing but a date range — belongs to the entry above it. */
function isDateOnlyLine(cleaned: string): boolean {
	const { startDate, endDate, rest } = extractDateRange(cleaned);
	return (startDate !== '' || endDate !== '') && rest.replace(/[\s,—–|()]/g, '') === '';
}

/**
 * Split a role heading into position / company / location. Handles both common
 * orders by looking for a title word rather than assuming position-first, and
 * reports when it had to guess so the reviewer knows to check.
 */
function splitRoleHeading(rest: string): {
	position: string;
	name: string;
	location: string;
	guessed: boolean;
} {
	// "Position at Company" is a strong, unambiguous signal.
	const atMatch = rest.match(/^(.*?)\s+at\s+(.*)$/i);
	if (atMatch) {
		const tail = atMatch[2].split(',').map((s) => s.trim());
		return {
			position: atMatch[1].trim(),
			name: tail.shift() ?? '',
			location: tail.join(', '),
			guessed: false
		};
	}

	const parts = rest
		.split(/,|—|–|\||\t/)
		.map((s) => s.trim())
		.filter(Boolean);

	if (parts.length === 0) return { position: '', name: '', location: '', guessed: false };
	if (parts.length === 1) {
		// One chunk — assume it's the title (the company usually follows elsewhere).
		return { position: parts[0], name: '', location: '', guessed: false };
	}

	const titleIdx = parts.findIndex(hasTitleWord);
	if (titleIdx === 0) {
		// "Position, Company, City, ST" — the common case.
		return { position: parts[0], name: parts[1] ?? '', location: parts.slice(2).join(', '), guessed: false };
	}
	if (titleIdx > 0) {
		// "Company — Position, City" — the order we used to get backwards.
		const rem = parts.filter((_, i) => i !== titleIdx && i !== 0);
		return { position: parts[titleIdx], name: parts[0], location: rem.join(', '), guessed: false };
	}
	// No title word anywhere — fall back to position-first, but say so.
	return { position: parts[0], name: parts[1] ?? '', location: parts.slice(2).join(', '), guessed: true };
}

function parseExperience(lines: string[]): { items: WorkItem[]; warnings: string[] } {
	const items: WorkItem[] = [];
	const warnings: string[] = [];
	let current: WorkItem | null = null;

	let sawBullet = false;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;

		if (isBullet(raw)) {
			// Don't drop bullets that appear before the first role heading —
			// open an implicit entry so the reviewer sees them.
			if (!current) {
				current = newWorkItem();
				items.push(current);
			}
			current.highlights.push(stripBullet(raw));
			sawBullet = true;
			continue;
		}

		const cleaned = clean(raw);
		let { startDate, endDate, rest } = extractDateRange(cleaned);
		// No range? A lone trailing date still dates the role ("… at Acme (2025)").
		if (!startDate && !endDate) {
			const lone = cleaned.match(TRAILING_DATE_RE);
			if (lone) {
				startDate = parseDate(lone[1]);
				rest = cleaned.slice(0, lone.index).replace(/[,—–|(]\s*$/, '').trim();
			}
		}

		// A line that is ONLY a date range belongs to the role above it — it is not
		// a new heading (this used to make the date string become the job title).
		if (isDateOnlyLine(cleaned) && current && !current.startDate && !sawBullet) {
			current.startDate = startDate;
			current.endDate = endDate;
			continue;
		}

		// Bold is only a heading signal when the line STARTS with it (how resumes
		// bold "**Position**, Company"). A prose line with mid-sentence emphasis
		// ("Passionate about **diversity** hiring") is not a heading.
		const startsBold = /^\s*\*\*/.test(raw);
		const isHeading = startDate !== '' || endDate !== '' || startsBold || hasTitleWord(cleaned);

		// A company/location line directly under a heading that lacks a company
		// ("People Operations Associate" / "Monstro, New York, NY" on two lines).
		if (!isHeading && current && !current.name && !sawBullet && cleaned.length < 80) {
			const parts = cleaned.split(/,|—|–|\|/).map((s) => s.trim()).filter(Boolean);
			current.name = parts[0] ?? '';
			current.location = parts.slice(1).join(', ');
			continue;
		}

		if (isHeading) {
			const { position, name, location, guessed } = splitRoleHeading(rest || cleaned);
			if (guessed && name) {
				warnings.push(
					`Couldn't tell the job title from the company in "${cleaned.slice(0, 48)}" — check that role.`
				);
			}
			current = { name, position, location, startDate, endDate, summary: '', highlights: [] };
			items.push(current);
			sawBullet = false;
		} else {
			// A non-bullet, non-heading line = prose summary for the current entry
			// (opening an implicit one rather than dropping pre-heading prose).
			if (!current) {
				current = newWorkItem();
				items.push(current);
			}
			current.summary = current.summary ? `${current.summary} ${cleaned}` : cleaned;
		}
	}

	// Drop entries the heuristics opened but never filled (no title, no company,
	// no bullets) — they were pure noise in the review editor.
	const kept = items.filter(
		(w) => (w.position ?? '') !== '' || (w.name ?? '') !== '' || w.highlights.length > 0
	);
	return { items: kept, warnings };
}

function parseEducation(lines: string[]): EducationItem[] {
	const items: EducationItem[] = [];
	const SCHOOL_RE = /(university|college|institute|school|academy|polytechnic)/i;
	const DEGREE_RE = /(bachelor|master|associate|ph\.?d|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?b\.?a|doctor|diploma|certificate)/i;

	let current: EducationItem | null = null;
	for (const raw of lines) {
		if (!raw.trim()) continue;

		if (isBullet(raw)) {
			if (current) (current.courses ??= []).push(stripBullet(raw));
			continue;
		}

		const cleaned = clean(raw);
		const { startDate, endDate, rest } = extractDateRange(cleaned);
		const parts = rest.split(/,|—|–|\|/).map((s) => s.trim()).filter(Boolean);

		const institution = parts.find((p) => SCHOOL_RE.test(p)) ?? '';
		const degreePart = parts.find((p) => DEGREE_RE.test(p)) ?? '';
		const area = parts.find((p) => p !== institution && p !== degreePart) ?? '';

		current = {
			institution,
			studyType: degreePart,
			area,
			startDate,
			endDate
		};
		items.push(current);
	}

	return items;
}

function parseSkills(lines: string[]): { skills: SkillItem[]; languages: LanguageItem[] } {
	const skills: SkillItem[] = [];
	const languages: LanguageItem[] = [];

	const splitKeywords = (s: string): string[] =>
		s
			.split(/[,;|]/)
			.map((k) => clean(k))
			.filter(Boolean);

	for (const raw of lines) {
		const line = clean(isBullet(raw) ? stripBullet(raw) : raw);
		if (!line) continue;

		const colon = line.indexOf(':');
		if (colon > 0 && colon <= 40) {
			const category = line.slice(0, colon).trim();
			const rest = line.slice(colon + 1).trim();
			if (/^languages?$/i.test(category)) {
				for (const kw of splitKeywords(rest)) languages.push({ language: kw });
			} else {
				skills.push({ name: category, keywords: splitKeywords(rest) });
			}
		} else {
			// No category — a loose keyword list becomes one "Skills" group.
			const kws = splitKeywords(line);
			if (kws.length) {
				const existing = skills.find((s) => s.name === 'Skills');
				if (existing) existing.keywords = [...(existing.keywords ?? []), ...kws];
				else skills.push({ name: 'Skills', keywords: kws });
			}
		}
	}

	return { skills, languages };
}

const TRAILING_DATE_RE = new RegExp(`(?:^|[,—–|(]\\s*)(${DATE_TOKEN})\\s*\\)?\\s*$`, 'i');

function parseCertificates(lines: string[]): CertificateItem[] {
	const items: CertificateItem[] = [];
	for (const raw of lines) {
		const line = clean(isBullet(raw) ? stripBullet(raw) : raw);
		if (!line) continue;

		// A cert usually carries a single date, not a range — try the range
		// first, then a lone trailing year like "2020" or "(2021)".
		let date = '';
		let rest = line;
		const range = extractDateRange(line);
		if (range.startDate) {
			date = range.startDate;
			rest = range.rest;
		} else {
			const lone = line.match(TRAILING_DATE_RE);
			if (lone) {
				date = parseDate(lone[1]);
				rest = line.slice(0, lone.index).replace(/[,—–|(]\s*$/, '').trim();
			}
		}

		const parts = (rest || line).split(/,|—|–|\|/).map((s) => s.trim()).filter(Boolean);
		items.push({
			name: parts[0] ?? line,
			issuer: parts[1] ?? '',
			date
		});
	}
	return items;
}

function parseProjects(lines: string[]): ProjectItem[] {
	const items: ProjectItem[] = [];
	let current: ProjectItem | null = null;
	for (const raw of lines) {
		if (!raw.trim()) continue;
		if (isBullet(raw)) {
			if (!current) {
				current = newProjectItem();
				items.push(current);
			}
			current.highlights.push(stripBullet(raw));
			continue;
		}
		const cleaned = clean(raw);
		const { rest } = extractDateRange(cleaned);
		current = newProjectItem();
		current.name = (rest || cleaned).split(/[—–|]/)[0].trim();
		items.push(current);
	}
	return items;
}

function parseLanguages(lines: string[]): LanguageItem[] {
	const out: LanguageItem[] = [];
	for (const raw of lines) {
		const line = clean(isBullet(raw) ? stripBullet(raw) : raw);
		for (const part of line.split(/[,;|]/)) {
			const t = part.trim();
			if (t) out.push({ language: t });
		}
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Parse pasted resume text into a best-effort draft `ResumeDocument`.
 * Never throws; anything it can't place is reported in `warnings`.
 */
export function parseResumeText(raw: string): ParseResult {
	const doc = emptyProfile();
	const warnings: string[] = [];

	if (!raw || !raw.trim()) {
		warnings.push('Nothing to parse — the pasted text was empty.');
		return { doc, warnings };
	}

	const lines = raw.replace(/\r\n?/g, '\n').split('\n');

	// The header block is everything before the first recognized section header.
	let firstHeaderIdx = lines.findIndex((l) => classifyHeader(l) !== null);
	if (firstHeaderIdx === -1) firstHeaderIdx = lines.length;

	parseHeader(lines.slice(0, Math.max(firstHeaderIdx, 1)), doc, warnings);

	const blocks = segment(lines, 0).filter((b) => b.section !== 'other');
	if (blocks.length === 0) {
		// No section headers at all. Rather than give up (which lost the entire
		// résumé), run the role heuristics over the body — "Position at Company
		// (2020–2022)" lines are still recognisable on their own.
		const body = lines.slice(Math.max(firstHeaderIdx === lines.length ? 1 : firstHeaderIdx, 1));
		const rescued = parseExperience(body);
		if (rescued.items.length > 0) {
			doc.work.push(...rescued.items);
			warnings.push(...rescued.warnings);
			warnings.push(
				`No section headings found, so roles were inferred from the text — ${rescued.items.length} ` +
					'found. Check them carefully.'
			);
		} else {
			warnings.push(
				'No standard sections (Experience, Education, Skills, …) were detected. ' +
					'Contact details were extracted; add the rest in the editor.'
			);
		}
		return { doc, warnings };
	}

	for (const block of blocks) {
		switch (block.section) {
			case 'summary':
				doc.basics.summary = block.lines.map(clean).filter(Boolean).join(' ');
				break;
			case 'experience': {
				// Multiple experience sections (e.g. "Recruiting" + "Project Mgmt") all
				// feed the single work[] array, preserving order.
				const r = parseExperience(block.lines);
				doc.work.push(...r.items);
				warnings.push(...r.warnings);
				break;
			}
			case 'education':
				doc.education.push(...parseEducation(block.lines));
				break;
			case 'skills': {
				const { skills, languages } = parseSkills(block.lines);
				doc.skills.push(...skills);
				doc.languages.push(...languages);
				break;
			}
			case 'certificates':
				doc.certificates.push(...parseCertificates(block.lines));
				break;
			case 'projects':
				doc.projects.push(...parseProjects(block.lines));
				break;
			case 'languages':
				doc.languages.push(...parseLanguages(block.lines));
				break;
		}
	}

	// Flag entries the heuristics left obviously incomplete so the reviewer knows.
	doc.work.forEach((w, i) => {
		if (!w.name) warnings.push(`Work entry ${i + 1} ("${w.position || 'untitled'}") is missing a company — check it.`);
	});

	return { doc, warnings };
}
