# ReproducibiliTea website modernization

## Context

The site is a Jekyll static site deployed on Netlify, with journal club (JC) data stored as YAML-frontmatter markdown files in `_journal-clubs/`, committed via the GitHub API from Netlify Functions (`src/*.js`). Blog posts are plain Jekyll collection files, edited directly via git by collaborators — this workflow works well and is not changing.

Trigger: OSF is retiring its "Projects" product in November 2026. `new-jc.js` currently auto-creates an OSF Project for every new JC (`callOSF`), which must stop. Investigating that surfaced several other problems worth fixing in the same pass, and the user asked for a broader modernization (prettier, more functional, testable, maintainable) subject to hard anti-goals: no unnecessary complexity, no new ongoing maintenance burden, no new attack surface, no new financial cost.

### Findings that shaped this design

- `_config.yml` has a **live Google Maps API key committed in plaintext** — billing/attack-surface risk regardless of anything else in this spec.
- `jc-rollcall.js` has a date-parsing bug: `yaml['last-update-timestamp']` is already a plain number from `YAML.parse`, but the code does `parseInt(lastUpdate[1])`, indexing a number, which always yields `NaN` → `Invalid Date`. The "has this JC gone stale" check (`jc.lastUpdate < TOO_OLD`) is therefore always false — rollcall does not fire in production today.
- There is **no scheduled trigger** wired up anywhere (no GH Actions cron, no Netlify scheduled function config) for rollcall — it has no working schedule at all currently.
- `edit-jc_create-token.js`'s rate-limit check counts *expired* tokens and never blocks — a no-op guard. Tokens are generated with `Math.random()`.
- MongoDB exists solely to store edit tokens and rollcall logs — a database kept alive for two narrow, low-volume purposes.
- Creation is gated by a single shared secret (`AUTH_CODE`) that a human distributes after vetting the requester off-platform.
- `add-jcid.js` is a dead one-off migration script.
- `conference2026.html` is 6.4MB and ships in every build — unrelated to this spec, flagged for separate cleanup.
- Six GitHub API calls set `Content-Length` from a JS string's `.length` (UTF-16 code-unit count) instead of its UTF-8 byte length: `new-jc.js:508,580,765` and `jc-rollcall.js:338,365,411`. For any non-ASCII character the true byte length exceeds `.length`, undercounting the header. `new-jc.js:765` is live today — it wraps the free-text edit "commit message" (`editToken.message`) as raw (non-base64) JSON text, so a non-Latin/accented character there can truncate or corrupt the request GitHub receives. The other five carry ASCII-safe values currently (jcid, fixed strings) but share the same latent bug. Note this is separate from file *content* (titles, addresses, descriptions), which already round-trips UTF-8 correctly today via explicit `Buffer.from(x, 'utf8').toString('base64')` on write and `Buffer.from(x, 'base64').toString()` (utf8 default) on read.

## Anti-goals (constraints on every decision below)

No unnecessary complexity. No new recurring maintenance. No new attack surface. No new ongoing financial cost.

## Architecture

Keep the existing spine — it already satisfies the anti-goals:

- Jekyll static site, deployed on Netlify (free tier).
- Journal club data as git-committed markdown+YAML files — versioned, auditable, no content database.
- Netlify Functions for the dynamic bits: creating/editing a JC, verifying tokens.

Two things are removed from the architecture:

- **MongoDB** — dropped entirely. Its only job (edit-token storage, rollcall logging) moves to stateless signed tokens and to plain log output.
- **Ad-hoc per-page CSS/JS** — replaced by one small, consistent custom stylesheet/include set. `minima` itself stays as the underlying Jekyll theme/layout engine (see §4) — forking its layouts to remove the gem entirely would trade a small CSS-override file for permanently maintaining our own copies of `_layouts/default.html`/`page.html`/`home.html`, which is more ongoing maintenance, not less.

Rollcall moves off Netlify Functions onto a **GitHub Actions scheduled workflow**. Rationale: there is no existing scheduled infrastructure to preserve either way; running natively in GitHub Actions gives free, no-PAT repo write access via the built-in `GITHUB_TOKEN`, removing the need to manage a GitHub PAT as a secret at all. Only the Mailgun API key is duplicated as a GitHub Actions secret (it already exists as a Netlify env var for other functions) — an acceptable, minimal duplication.

## Components

### 1. Journal club creation (replaces `join-reproducibiliTea.html` creation path + `new-jc.js`)

Replaces the shared `AUTH_CODE` gate with a two-step, token-based flow reusing the same signed-token primitive built for edits (see §2):

1. Requester fills in JC details + their email. Submitting sends them a signed confirmation token by email (same shape as the edit-token email).
2. Clicking the confirmation link creates the JC's markdown file via the GitHub API, as today, but with `status: pending` added to its frontmatter. Slack/Zotero/GitHub calls proceed as today; **the OSF-project-creation call (`callOSF`) is removed**. The `osf:` field remains in the schema for manual/future population — no automation touches it.
3. Every admin address in a new `ADMIN_EMAILS` env var (comma-separated, same pattern as the existing `EMAIL_REPORT_TO`) receives a notification with a second signed token (approve link).
4. Clicking approve flips `status: pending` → `status: active` via one GitHub commit. The JC is live.

Pending JCs are excluded from public listings/map/search via a single Liquid filter (`unless jc.status == "pending"`) in `journal-clubs.md`, `_includes/jc-showcase.html`, and `map.html`. The admin overview (`jc-overview.html`) shows pending JCs too, visibly flagged, so admins can see what's awaiting approval without relying only on email.

### 2. Edit-token auth (replaces `edit-jc_create-token.js` + `edit-jc_check-token.js` + MongoDB)

Tokens become self-contained and stateless:

```
token = base64url(payload) + "." + HMAC-SHA256(base64url(payload), EDIT_TOKEN_SECRET)
payload = { purpose, email, jcid, message, expires }
```

`purpose` distinguishes edit-confirmation / creation-confirmation / admin-approval tokens so one signing/verification function serves all three flows in §1 and here. Verifying a token = recompute the HMAC, compare, check `expires`. No database read, no stored state. Trade-off accepted: tokens cannot be revoked early, only by expiry (unchanged from today's 2-day edit-token expiry; creation/approval tokens get their own suitable expiry, e.g. 24h).

`EDIT_TOKEN_SECRET` is a new Netlify environment variable. All token verification (edit, creation-confirm, admin-approve) happens in Netlify functions; the GitHub Actions rollcall workflow never touches tokens, so it does not need this secret.

### 3. Rollcall (`jc-rollcall.js` → GitHub Actions scheduled workflow)

Same behavior as designed today: notify → first reminder → second reminder → deactivate, gated on `MAX_DAYS_SINCE_UPDATE` / `MIN_DAYS_BETWEEN_EMAILS`. Fixes:

- Correct date handling: `last-update-timestamp` and `last-message-timestamp` are plain numbers from `YAML.parse` — use them directly, no `[1]` indexing.
- Runs as a plain Node script invoked by a scheduled GitHub Actions workflow (e.g. daily `cron`), not an HTTP Netlify function. Sandbox/target-JC selection becomes a workflow input, not `event.queryStringParameters` sniffing.
- Rollcall run outcomes are logged (see §5), not written to MongoDB.

### 4. Presentation

Keep `minima` as the Jekyll layout engine (its gem-provided `_layouts/default.html`/`page.html`/`home.html` stay in use, updated automatically via Bundler — not forked). Deliver the full **Modern Rounded** brand direction (rounded cards, soft shadows, brand colors `#0086cf` blue / `#004c6c` dark blue / white / `#404040` near-black) as one cohesive override stylesheet loaded after minima's own CSS, replacing the current ad-hoc `custom.css`/`tweaks.css`/`jc-overview.css`/`join-form.css` with a single consistent set of component styles (nav, footer, card, button) applied site-wide.

### 5. Maps

Replace Google Maps (`map.html`, `_includes/jc-map.html`, and the leaked API key in `_config.yml`) with **Leaflet + OpenStreetMap tiles** — no API key, no quota, no billing, directly satisfies the no-new-cost / no-new-attack-surface anti-goals. The Google Maps Geocoding call in `_includes/jc-lookup.html` (used rarely, only for JCs missing `geolocation`, from the admin-only `jc-overview.html` tool) moves to OSM's free Nominatim geocoder.

**Immediate, independent of the rest of this spec**: rotate the currently-committed Google Maps key now, regardless of timeline for the Leaflet migration.

### 6. UTF-8 correctness

The site's non-English content (organiser names, university addresses, descriptions) must keep round-tripping correctly through git-committed plaintext files. UTF-8 is the standard to hold to throughout — it's what GitHub's Contents API, git diffs, and Jekyll's markdown rendering all assume for "plaintext"; UTF-16 would break all three and isn't used anywhere else in this stack.

File content already does this correctly (`Buffer.from(x, 'utf8').toString('base64')` on write, `Buffer.from(x, 'base64').toString()` on read) and stays as-is. Fix, as part of the rewrites already touching these files (§1 creation, §3 rollcall): replace every hand-computed `'Content-Length': someJsonString.length` with `Buffer.byteLength(someJsonString, 'utf8')`, or drop the header and let `fetch` compute it from the body. Applies to all six call sites listed above.

### 7. Testing & logging

- Unit tests via Node's built-in `node:test` + `assert` (no new dependency) covering pure logic only: `cleanData`/`checkData` validation, token sign/verify (valid, expired, tampered), rollcall staleness calculations, YAML frontmatter generation. External calls (GitHub/Mailgun/Slack/Zotero) are mocked/injected, never exercised in tests.
- Each function logs one structured (JSON) line per request/run with outcome (success/fail + reason) — enough to diagnose from Netlify/Actions logs, not a logging framework or new dependency.
- Existing Jekyll build CI (`jekyll.yml`) is unchanged and remains the content/build safety net.

## Rollout

No data migration needed: existing `_journal-clubs/*.md` files are untouched by this work (their `osf:` field simply stops being auto-populated for *new* clubs going forward). Steps ship independently, in any order, none blocking the others:

1. Fix rollcall's date bug; move it to a GitHub Actions scheduled workflow.
2. Replace edit-tokens with signed HMAC tokens; drop MongoDB.
3. Build the creation email-confirm + admin-approval flow; drop OSF-project creation; retire `AUTH_CODE`.
4. Restyle: drop `minima`, ship the brand design system, migrate maps to Leaflet/OSM; rotate the Maps API key immediately, independent of the migration's completion.

## Out of scope (flagged, not forgotten)

- A replacement OSF-alternative resource (materials hosting, templates) for new JCs — undecided upstream ("we'll create other OSF resources, or other resources elsewhere"); no automation is built for it here.
- `conference2026.html` (6.4MB, unrelated one-off page) — separate cleanup.
- `add-jcid.js` — dead one-off migration script; delete during implementation cleanup.
