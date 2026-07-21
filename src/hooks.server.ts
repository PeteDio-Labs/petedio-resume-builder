import type { Handle } from '@sveltejs/kit';
import { getIdentity } from '$lib/server/auth';

/**
 * Single-user allow-list. Deny-by-default: a verified Cloudflare Access
 * identity that isn't in this list still gets a 403, not access.
 */
function isAllowed(email: string): boolean {
	const allowList = (process.env.ALLOWED_USERS ?? '')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	return allowList.includes(email.toLowerCase());
}

export const handle: Handle = async ({ event, resolve }) => {
	const identity = await getIdentity(event);

	if (!identity) {
		event.locals.user = null;
		return resolve(event);
	}

	if (!isAllowed(identity.email)) {
		return new Response('403 — not provisioned for this app', {
			status: 403,
			headers: { 'content-type': 'text/plain' }
		});
	}

	event.locals.user = { email: identity.email };
	return resolve(event);
};
