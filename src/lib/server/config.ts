/**
 * Central runtime configuration, read entirely from the environment
 * (12-factor) — modeled on the palworld-panel `config.ts`. Every consumer that
 * needs to know "are we in demo mode?", "who's allowed?", etc. asks here, so
 * there is one source of truth and one place to change the wiring.
 *
 * Server-only (`$lib/server`): never imported into client code.
 *
 * These are functions rather than a frozen const so a value can be flipped per
 * request/test without caring about module-import order — the reads are cheap.
 */

/** Read an env var, treating "" as unset so a blank line in `.env` = default. */
export function env(name: string, fallback?: string): string | undefined {
	const v = process.env[name];
	return v === undefined || v === '' ? fallback : v;
}

// NOTE: there is deliberately no `isProduction()` here. A "are we in production"
// decision for a *security* gate must use a build-time constant (SvelteKit's
// `dev` from `$app/environment`), never runtime `NODE_ENV` — the deploy is not
// guaranteed to set it, and relying on it was a full auth bypass. See
// hooks.server.ts.

/**
 * Demo mode — a single env switch that fakes the app's external dependencies
 * (MongoDB now; Ollama/AI later) with in-memory stand-ins so the whole app runs
 * standalone, for showing it off. Off by default, exactly like the panel's
 * `PANEL_APPLIER=demo`. It fakes *data*, never auth in production (see auth.ts).
 */
export function isDemoMode(): boolean {
	return env('DEMO_MODE') === 'true';
}

/** The verified emails permitted to use the app (deny-by-default), lowercased. */
export function allowedUsers(): string[] {
	return (env('ALLOWED_USERS') ?? '')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
}

/**
 * The synthetic identity that demo data is seeded for and viewed as. Defaults
 * to the first allow-listed user (so a real deployment's demo shows under the
 * expected login), else a placeholder for a zero-config local demo.
 */
export function demoUser(): string {
	return (env('DEMO_USER') ?? allowedUsers()[0] ?? 'demo@resume.local').toLowerCase();
}

/**
 * Allow-list gate (deny-by-default). In demo mode the demo user is also allowed
 * so a standalone demo needs no extra config. This only decides *which* already
 * verified identities may proceed — it never substitutes for verification.
 */
export function isAllowedEmail(email: string): boolean {
	const e = email.toLowerCase();
	if (allowedUsers().includes(e)) return true;
	return isDemoMode() && e === demoUser();
}
