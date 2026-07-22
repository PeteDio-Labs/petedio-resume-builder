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

/** Status → the app's accent color, for pills in the UI. */
export const STATUS_COLOR: Record<ApplicationStatus, string> = {
	saved: 'var(--label-2)',
	applied: 'var(--blue)',
	interviewing: 'var(--orange)',
	offer: 'var(--green)',
	rejected: 'var(--red)',
	ghosted: 'var(--label-3)'
};
