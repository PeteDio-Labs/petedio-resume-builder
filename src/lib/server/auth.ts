/**
 * Cloudflare Access identity verification.
 *
 * All JWT-verification mechanics live behind `getIdentity(event)` so the
 * mechanism (Cloudflare Access JWKS today) can be swapped later — e.g. for a
 * different IdP or a session-cookie scheme — without touching callers in
 * hooks.server.ts or routes. This module does ONLY real verification; the
 * dev/demo escape hatch lives in `hooks.server.ts`, gated by the build-time
 * `dev` flag so it can never activate in a deployed server (keeping this module
 * — and its unit tests — free of the SvelteKit runtime).
 *
 * Env vars (see .env.example):
 *   CF_ACCESS_TEAM_DOMAIN  — e.g. "your-team.cloudflareaccess.com" (no protocol)
 *   CF_ACCESS_AUD          — the Access application's Audience (AUD) tag
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
 * throwing — callers must treat `null` as "not authenticated". The returned
 * email is lowercased so it's a stable row-scope key downstream.
 */
export async function getIdentity(event: RequestEvent): Promise<Identity | null> {
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
		return { email: payload.email.toLowerCase() };
	} catch (err) {
		console.error('getIdentity: JWT verification failed', err);
		return null;
	}
}
