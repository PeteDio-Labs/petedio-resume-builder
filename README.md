# petedio-resume-builder

AI resume builder for Sonia. SvelteKit + Bun + MongoDB, deployed behind Cloudflare Access.

This is the **P1 scaffold**: platform wiring only (auth hook, DB client, repository skeleton,
CI, a status page). No resume-generation features yet — see the Resume Builder — Planning
doc in Linear for the full roadmap.

## Stack

- SvelteKit 2 (Svelte 5, runes) + Vite, `@sveltejs/adapter-node`
- Bun for install/scripts; runtime-neutral server code (no `Bun.*` APIs)
- MongoDB (official driver) — not provisioned yet, client wiring only
- Cloudflare Access (JWT verified with `jose`) for auth, single-user allow-list

## Local dev

```sh
bun install
cp .env.example .env   # fill in placeholder values, see below
bun run dev
```

Then open the printed localhost URL.

### Auth in local dev

Cloudflare Access sits in front of the deployed app and adds a `Cf-Access-Jwt-Assertion`
header that `hooks.server.ts` verifies. There's no Cloudflare edge in local dev, so that
header never arrives — **the hook fails closed** (no identity, "Not provisioned" shown)
rather than crashing.

To exercise the signed-in path locally without a real Cloudflare token, set `DEV_FAKE_IDENTITY`
in `.env` to an email that's also in `ALLOWED_USERS`. This is a deliberate tradeoff: it trusts
an env var instead of a verified token, and only activates when running in dev mode
(`bun run dev`) — see `src/lib/server/auth.ts` for the guard. It has no effect in a built
app.

## Build

```sh
bun run build     # SvelteKit build via adapter-node -> build/
bun build/index.js  # run the production server (needs env vars set)
```

## Test

```sh
bun test
```

## Env vars

See `.env.example` for the full list (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`,
`ALLOWED_USERS`, `DEV_FAKE_IDENTITY`, `MONGODB_URI`, `MONGODB_DB_NAME`). No real values are
committed — this repo is public.
