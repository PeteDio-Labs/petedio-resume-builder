/**
 * Shared (client-safe) types for the job/application tracker. No server imports
 * so both the row-scoped repository and the Svelte UI can use them.
 */

/** The application pipeline (per the Resume Builder plan). */
export type ApplicationStatus =
	| 'saved'
	| 'applied'
	| 'interviewing'
	| 'offer'
	| 'rejected'
	| 'ghosted';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
	'saved',
	'applied',
	'interviewing',
	'offer',
	'rejected',
	'ghosted'
];

export function isApplicationStatus(s: string): s is ApplicationStatus {
	return (APPLICATION_STATUSES as string[]).includes(s);
}

/** Application Q&A (F14 / T6). */
export type QaKind = 'why-us' | 'behavioral' | 'experience' | 'logistics' | 'custom';

export interface QaEntry {
	id: string;
	question: string;
	kind: QaKind;
	context: string;
	targetChars: number;
	storyId: string | null;
	answer: string;
	updatedAt: string;
}

export const QA_PRESETS: { kind: QaKind; label: string; question: string }[] = [
	{ kind: 'why-us', label: 'Why us?', question: 'Why do you want to work here?' },
	{ kind: 'behavioral', label: 'Conflict', question: 'Tell me about a time you handled conflict.' },
	{ kind: 'behavioral', label: 'Led without title', question: 'Tell me about a time you led without formal authority.' },
	{ kind: 'behavioral', label: 'A failure', question: 'Tell me about a mistake and what you changed.' },
	{ kind: 'experience', label: 'Experience with…', question: 'Describe your experience with ' }
];

/** Status → the app's accent color, for pills in the UI. */
export const STATUS_COLOR: Record<ApplicationStatus, string> = {
	saved: 'var(--label-2)',
	applied: 'var(--blue)',
	interviewing: 'var(--orange)',
	offer: 'var(--green)',
	rejected: 'var(--red)',
	ghosted: 'var(--label-3)'
};
