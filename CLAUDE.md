# petedio-resume-builder (Agent Context)

AI resume-builder web app for a single user (Sonia) — tailors resumes against job
descriptions; replaces the retired agent-fleet system.

## Stack
- **SvelteKit 2 + Svelte 5** (runes), built with **Vite**, served via `@sveltejs/adapter-node`
  (`bun build/index.js`). **Bun** for install/scripts (`bun install`, `bun run dev`, `bun test`)
  — dev runs Vite on Node under the hood; app/server code stays runtime-neutral (native
  `fetch`, Web Streams — no `Bun.*` APIs).
- **MongoDB** (official `mongodb` driver) — not provisioned yet; P1 only wires the client.
- **Cloudflare Access** for auth — JWT verified with `jose` in `hooks.server.ts`, single-user
  allow-list via `ALLOWED_USERS`, deny-by-default.

## Public-repo rule (hard rule — this repo is public)
**Never commit real personal data.** All example/fixture/test data must be synthetic — a fake
name ("Jane Doe"), fake companies, fake job postings. Nothing that could be mistaken for
Sonia's actual resume content, contact info, or work history. Secrets and live infra values
(Vault paths, Cloudflare zone/AUD, real domains) never go in code — env vars only, documented
in `.env.example`.

## Layout
- `src/hooks.server.ts` — Cloudflare Access verification + allow-list gate; sets
  `event.locals.user`.
- `src/lib/server/config.ts` — the single env-driven config module (12-factor, mirrors the
  palworld panel's `config.ts`): `isDemoMode()`, `allowedUsers()`, `demoUser()`,
  `isAllowedEmail()`. Everything that gates on the environment asks here.
- `src/lib/server/auth.ts` — `getIdentity(event)`; all JWT-verification mechanics live here so
  the mechanism can change later without touching callers.
- `src/lib/server/db/` — `client.ts` (real Mongo singleton, lazy-connect), `memory.ts` (the
  in-memory **demo** store), `provider.ts` (`resolveDb()` picks real vs demo from `DEMO_MODE`,
  the analog of the panel's `createApplier()`), and `repository.ts` (row-scoped accessors).
  **Routes must never import a Db client directly** — go through `repository.ts` so every
  read/write is scoped to `userEmail`.
- `src/lib/resume/` — `schema.ts` (JSON Resume v1.x + `x_petedio` types, factories,
  `normalizeProfile` validation boundary) and `parse.ts` (deterministic paste-import; not AI).
- `src/lib/server/demo/sample-profile.ts` — synthetic sample profile used to seed demo mode.

## Demo mode
`DEMO_MODE=true` swaps external deps (MongoDB now, AI later) for in-memory stand-ins so the app
runs standalone — same idea and shape as the panel's `PANEL_APPLIER=demo`. Selected at one
factory (`provider.ts`); default OFF; in a production build it only fakes data and never
bypasses auth. Future AI features should branch on `isDemoMode()` the same way.

## Source of truth
**Linear** `PeteDillo`/`PET` — see the **Resume Builder — Planning** doc for full context,
phased scope (P1 platform / P2+ resume-generation features), and decisions already made
(stack pins, architecture). Implemented so far: P1 platform scaffold, the P2 master profile
(CRUD + paste-import parse, JSON Resume + story bank), and demo mode. Resume *tailoring* (the
Ollama/AI features) is not built yet.
