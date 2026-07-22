import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { getIdentity } from '$lib/server/auth';
import { demoUser, env, isAllowedEmail, isDemoMode } from '$lib/server/config';

/**
 * Dev/demo escape hatch for the missing Cloudflare edge in local dev.
 *
 * **Security-critical:** this is gated on `dev` from `$app/environment`, a
 * BUILD-TIME constant that SvelteKit compiles to `false` in the production
 * bundle — so this entire branch is dead code in a deployed server and cannot
 * grant an unverified identity there. It deliberately does NOT depend on
 * `NODE_ENV`, which the deploy is not guaranteed to set (relying on it was a
 * full auth bypass).
 *
 *   1. `DEV_FAKE_IDENTITY=<email>` → that email.
 *   2. else, `DEMO_MODE=true` → the demo user (one-flag standalone demo).
 *
 * In production, identity comes only from a verified Cloudflare Access JWT; demo
 * mode there fakes DATA only (see db/provider.ts), never auth.
 */
function getDevIdentity(): { email: string } | null {
	if (!dev) return null;

	const fake = env('DEV_FAKE_IDENTITY');
	if (fake) return { email: fake.toLowerCase() };
	if (isDemoMode()) return { email: demoUser() };
	return null;
}

/**
 * Never let a browser reuse a stale HTML document.
 *
 * The built assets are already content-hashed by Vite (`app.Qc5jP2TG.js`) and
 * served `immutable` for a year, which is correct — the filename changes when
 * the content does. The HTML that NAMES those hashes is the part that must stay
 * fresh: cached, it keeps pointing at the previous deploy's bundles. It shipped
 * with only an ETag and no cache directive, which leaves the decision to each
 * browser's heuristics.
 *
 * `no-cache` still allows the 304 revalidation round-trip — it means "check
 * with me first", not "don't store".
 */
function noStaleDocuments(response: Response): Response {
	const type = response.headers.get('content-type') ?? '';
	if (type.includes('text/html') && !response.headers.has('cache-control')) {
		response.headers.set('cache-control', 'no-cache');
	}
	return response;
}

export const handle: Handle = async ({ event, resolve }) => {
	const identity = (await getIdentity(event)) ?? getDevIdentity();

	if (!identity) {
		event.locals.user = null;
		return noStaleDocuments(await resolve(event));
	}

	// Deny-by-default: a verified identity that isn't allow-listed (nor the demo
	// user in demo mode) still gets a 403, not access.
	if (!isAllowedEmail(identity.email)) {
		return new Response('403 — not provisioned for this app', {
			status: 403,
			headers: { 'content-type': 'text/plain' }
		});
	}

	// Normalize the scope key: the allow-list check is case-insensitive, so the
	// identity that flows into locals + the row-scoped repository must be too,
	// or the same human at two email casings would split into two profiles.
	event.locals.user = { email: identity.email.toLowerCase() };
	return noStaleDocuments(await resolve(event));
};
