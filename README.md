# petedio-resume-builder

AI resume builder for Sonia. SvelteKit + Bun + MongoDB, deployed behind Cloudflare Access.

Built so far: the **P1 platform** (Cloudflare Access auth hook, row-scoped Mongo repository,
CI) and the **P2 master profile** — JSON Resume v1.x schema + story bank, deterministic
paste-import parser, profile CRUD, and **demo mode** (runs with no MongoDB). Resume *tailoring*
(the Ollama/AI features) is not built yet — see the Resume Builder — Planning doc in Linear for
the full roadmap.

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

## Demo mode

`DEMO_MODE=true` runs the whole app with **no external dependencies** — an in-memory data
store (no MongoDB) seeded with a synthetic sample profile, so it can be shown off standalone.
This mirrors the palworld panel's `PANEL_APPLIER=demo`: the demo store is a swap-in
implementation of the same data-layer interface, selected from the environment at one factory
(`src/lib/server/db/provider.ts`). Data resets when the server restarts.

Zero-config local demo — one line:

```sh
DEMO_MODE=true bun run dev
```

In dev, demo mode also auto-signs-you-in as the demo user (`DEMO_USER`, default the first
`ALLOWED_USERS` entry, else `demo@resume.local`), so you land straight in a populated profile.
In a **production build** demo mode only fakes data — it still requires a real Cloudflare
Access login and never bypasses auth. Off by default.

## MongoDB on Bun

The `mongodb` driver's `bson` dependency calls a `node:v8` API Bun hasn't implemented yet, so
importing it under Bun (tests, or the production server) throws without a shim. `bun-preload.js`
(wired via `bunfig.toml` `preload`) patches it. Remove once Bun ships the upstream fix.

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
`ALLOWED_USERS`, `DEV_FAKE_IDENTITY`, `DEMO_MODE`, `DEMO_USER`, `MONGODB_URI`,
`MONGODB_DB_NAME`). No real values are committed — this repo is public.
