/**
 * Cloudflare Access identity verification.
 *
 * All JWT-verification mechanics live behind `getIdentity(event)` so the
 * mechanism (Cloudflare Access JWKS today) can be swapped later — e.g. for a
 * different IdP or a session-cookie scheme — without touching callers in
 * hooks.server.ts or routes.
 *
 * Env vars (see .env.example):
 *   CF_ACCESS_TEAM_DOMAIN  — e.g. "your-team.cloudflareaccess.com" (no protocol)
 *   CF_ACCESS_AUD          — the Access application's Audience (AUD) tag
 *   ALLOWED_USERS          — comma-separated allow-list of verified emails
 *   DEV_FAKE_IDENTITY      — dev-only: see getDevIdentity() below
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { RequestEvent } from '@sveltejs/kit';

export interface Identity {
	email: string;
}

// jose caches the JWKS response internally; keep one set per process so we
// don't refetch Cloudflare's JWKS on every request.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(teamDomain: string) {
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
	}
	return jwks;
}

/**
 * Verifies the `Cf-Access-Jwt-Assertion` header set by Cloudflare Access on
 * requests to a protected hostname. Fails closed: any missing header,
 * missing env config, or verification error returns `null` rather than
 * throwing — callers must treat `null` as "not authenticated".
 */
export async function getIdentity(event: RequestEvent): Promise<Identity | null> {
	const devIdentity = getDevIdentity(event);
	if (devIdentity) return devIdentity;

	const token = event.request.headers.get('Cf-Access-Jwt-Assertion');
	if (!token) return null;

	const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
	const audience = process.env.CF_ACCESS_AUD;
	if (!teamDomain || !audience) {
		// Misconfigured deployment — fail closed rather than skip verification.
		console.error('getIdentity: CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD not set');
		return null;
	}

	try {
		const { payload } = await jwtVerify(token, getJwks(teamDomain), {
			issuer: `https://${teamDomain}`,
			audience
		});

		if (typeof payload.email !== 'string' || !payload.email) return null;
		return { email: payload.email };
	} catch (err) {
		console.error('getIdentity: JWT verification failed', err);
		return null;
	}
}

/**
 * Dev-only escape hatch: local dev has no Cloudflare edge in front of it, so
 * `Cf-Access-Jwt-Assertion` never arrives naturally. Setting DEV_FAKE_IDENTITY
 * (an email string) in `.env` lets you exercise signed-in routes locally.
 *
 * Tradeoff: this trusts an env var instead of a verified token, so it must
 * never be enabled outside local dev — there is no flag/default that turns
 * this on in a deployed environment; it only fires when the app is literally
 * running in Bun/Vite dev mode (`dev` is true) AND the var is set.
 */
function getDevIdentity(_event: RequestEvent): Identity | null {
	if (!isDevMode()) return null;

	const fake = process.env.DEV_FAKE_IDENTITY;
	return fake ? { email: fake } : null;
}

function isDevMode(): boolean {
	// SvelteKit sets NODE_ENV via Vite in dev; `vite dev` never sets it to
	// "production". Belt-and-suspenders check so this can't accidentally
	// activate in a built/deployed app.
	return process.env.NODE_ENV !== 'production';
}
