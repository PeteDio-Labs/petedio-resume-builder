# Gotchas

Hard-won things that cost real time, kept where the next agent will read them before
repeating them. Same role as `iac/docs/GOTCHAS.md` in the platform repo.

Several of these were paid for on **petedio-palworld-panel** — the app this one already
mirrors for `config.ts`, demo mode, and the applier/provider factory (see `CLAUDE.md`).
They are recorded here because they cost real time there and this app is close enough in
shape to hit every one of them.

---

## Auth: the edge is not your authentication

**Cloudflare Access only authenticates traffic that goes through Cloudflare.** A request
straight to the origin never meets it. Both apps sit behind a `cloudflared` tunnel, and
in both cases the origin port is reachable from the LAN with no Access involved:

```
http://192.168.50.242:8080/   -> 200      # this app, direct, no Cloudflare
https://cv.pdlab.dev/         -> 302 …    # the same app via the edge, bounced to Access
```

**This app handles it correctly, and that is the point worth preserving.**
`hooks.server.ts` derives identity *only* from a verified Access JWT, sets
`locals.user = null` when there is none, and denies by default — so the direct origin
request gets the HTML shell and `/profile` still `302`s. Verified 2026-07-23. The edge is
a second layer, not the only one.

The palworld panel is the counter-example: it has no identity of its own, so Access at the
edge is its *entire* gate, and anything on the same LAN can drive it — power the game
server off, broadcast to players — with no login at all. Same tunnel pattern, opposite
outcome, purely because one app checks identity itself and the other delegates it.

**Rules**
- Never let "it's behind Cloudflare Access" stand in for authorization in the app. Assume
  the origin port is reachable and gate every data route on `locals.user`.
- Enforce access on the **endpoint**, not in the UI. Hiding a control is presentation; the
  403/redirect is the control. (The panel's local dashboard hides its entry point *and*
  403s the endpoint — the hiding is a courtesy.)
- Never gate a security branch on `NODE_ENV`: the deploy is not guaranteed to set it, and
  relying on it here was a full auth bypass. Use the build-time `dev` from
  `$app/environment`, which SvelteKit compiles to `false` in the production bundle — the
  branch becomes dead code rather than a runtime coin-flip. Verify in the **built
  artifact**, not just in dev.

---

## UI: phone spacing does not survive being reused at desk width

A spacing scale tuned for a ~430px column treats every point as scarce. Reuse it in a
600px+ dialog or a wide layout and it reads cramped and cheap — section labels crowd the
group above them, actions crowd the content they act on. The material can look great and
the layout still feel wrong; that is a spacing problem, not a colour or blur problem.

What fixed it, from Apple's inset-grouped rhythm:

- A section header sits **far from what precedes it (~32px) and close to what it labels
  (~10px)**. That asymmetry is what makes grouping legible with no rules or boxes, and it
  is the single highest-leverage change.
- Separate an action from the content it acts on (~30px). A confirm button 12px under the
  last row reads as part of the list.
- Layout margins ≥ the [HIG](https://developer.apple.com/design/human-interface-guidelines/layout)
  16pt compact / 20pt regular; more at desk width.
- Tabular figures (`font-variant-numeric: tabular-nums`) on anything that ticks, or the
  number jitters its own width.

**Rule:** when reusing a component at a different width, re-derive the spacing — don't
scale the font sizes and call it responsive.

---

## Design for the device and its input, not the average device

The panel's host turned out to be a **touchscreen laptop with no comfortable keyboard**.
Two things followed that no amount of visual polish would have fixed:

- Bottom sheets are a thumb-reach affordance for a phone held in one hand. On a landscape
  screen driven by a finger they are the wrong shape, and drag-to-dismiss is a gesture
  nobody discovers. They became centered dialogs.
- Every "Custom — type your own" path was a **dead end**. They were hidden and the preset
  list grew instead, so every action is reachable by tapping alone.

**Rule:** establish how the thing is actually driven — finger, mouse, keyboard, which
screen — before designing the interaction. Ask if it isn't obvious. And when you remove a
free-text path, check nothing pre-selects the option you just hid: a pre-selected hidden
"Custom" row would have broadcast an **empty message**.

---

## Safari paints `opacity: 0` in some stacking contexts

A checkmark hidden with `opacity: 0` alone **still painted in Safari** when it sat inside
an `overflow: hidden` box under a `backdrop-filter` ancestor — so every row in a list
looked selected at once, while the DOM state was perfectly correct. Chromium honoured the
opacity, so it did not reproduce in testing.

```css
/* not enough on its own where a compositor is involved */
.check { opacity: 0; }

/* visibility is not composited away, so it always wins */
.check          { opacity: 0; visibility: hidden; transition: opacity .15s, visibility 0s linear .15s; }
.selected .check { opacity: 1; visibility: visible; transition: opacity .15s, visibility 0s; }
```

**Rule:** for a binary show/hide, `opacity` alone is a visual effect, not a hiding
mechanism — pair it with `visibility` (or `display`). Delay `visibility` by the fade
duration on the way out so the transition still animates.

**Rule (corollary):** anything involving `backdrop-filter`, `overflow: hidden` or
compositing needs a look in **Safari/WebKit specifically**. This app is used on iPhone;
Chromium passing means nothing here.

---

## Know *how* a thing is hidden before you re-anchor it

A sheet that hides by sliding off the bottom edge is hiding with a **transform**, not
`display: none`. Re-anchoring it to the centre re-anchored the transform too — and every
sheet in the app rendered stacked on screen at once.

**Rule:** before changing an element's positioning, check what its `.hidden`/closed state
actually does. If it hides via `transform`, moving it breaks the hiding.

---

## Shell and deploy

- **`set -o pipefail` is a bashism.** Ansible's `shell` module runs `/bin/sh`, which is
  `dash` on Ubuntu/Pop!_OS → `Illegal option -o pipefail`. Pin `executable: /bin/bash`.
  This has now bitten twice, in this repo's deploy and the panel's.
- **A build artifact that names hashed assets must not be cached.** Content-hashed bundles
  are correctly `immutable`, but the HTML naming them has to stay fresh or clients keep
  loading the previous deploy's bundles. `no-cache` on the document (still allows a 304)
  is the fix — see `noStaleDocuments` in `hooks.server.ts`.
- **Comparing two hosts' file trees:** `find … -exec sha256sum {} + | sort | sha256sum`
  gives a **false mismatch** — the hosts collate differently, so the sorted order differs
  while every file is identical. Use `LC_ALL=C sort`.

---

## CI: install with bun, build with node

`bun run build` works on a dev machine and fails in CI. Vite 8 spawns workers that hit
`node:v8 isBuildingSnapshot is not yet implemented in Bun`, and the build dies — locally
it only ever worked because a `node` binary happened to be on PATH, so bun handed the
build off to it. The `oven/bun` image has no node, so CI is the first place it surfaces.

`deploy.yml` therefore runs two containers over the same workspace: `oven/bun` for
`bun install --frozen-lockfile` (the lockfile is `bun.lock`), then `node:22-slim` for
`node node_modules/vite/bin/vite.js build`. This is the concrete form of `CLAUDE.md`'s
"app/server code stays runtime-neutral — dev runs Vite on Node under the hood".

**Rule:** "works locally with bun" is not evidence the build runs under bun. Check what is
actually on PATH before assuming a single-runtime container will reproduce it.

## GitHub OIDC `sub` is not one stable format across repos

The Vault CD role first failed with `claim "sub" does not match any associated bound claim
values`, with the repo name, audience and mount all correct. The cause: this repo emits an
**ID-qualified** subject —

```
repo:PeteDio-Labs@268380060/petedio-resume-builder@1308151391:ref:refs/heads/main
```

— while the older palworld-panel repo emits the classic `repo:OWNER/NAME:ref:…`. Compare
with `gh api repos/{owner}/{repo}/actions/oidc/customization/sub`.

**Rule:** bind CD roles on the `repository` and `ref` claims, not on a literal `sub` string.
They carry no prefix games, and together they are exactly as tight — this repo, pushes to
main only (a PR run carries `ref=refs/pull/N/merge` and is still excluded).

## Verify the thing, not the sign that usually accompanies it

Migrating the panel's game server, the restore "worked": service active, API answering,
UI green, correct server name — **and an empty world**. The save had been copied, but the
server picks which save to load from a *different* file that still pointed at a world it
had generated itself.

**Rule:** a service coming up healthy proves the process started, not that it is serving
the right data. Check an identifier that could only come from the data you restored (there:
the world GUID and day count). For this app the equivalent is checking a profile's actual
content after a restore or migration, not that the page rendered.

**Rule:** rehearse a destructive migration before the window that matters. That rehearsal
is the only reason the empty-world failure was found with nobody waiting.
