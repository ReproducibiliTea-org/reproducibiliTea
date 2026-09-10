# reproducibiliTea

![Jekyll site CI](https://github.com/mjaquiery/reproducibiliTea/workflows/Jekyll%20site%20CI/badge.svg)
[![Netlify Status](https://api.netlify.com/api/v1/badges/7cff052d-97ff-42ac-b2d8-f4ee29cb10d7/deploy-status)](https://app.netlify.com/projects/rpt-org/deploys)

Website for the ReproducibiliTea Journal Club and Podcast

## Runtime configuration

### Netlify functions (`src/`)

Edit tokens are stateless, HMAC-signed strings — no database. Configure:

- `EDIT_TOKEN_SECRET`: secret key used to sign and verify edit tokens. Rotating it invalidates all outstanding tokens.
- `ADMIN_EMAILS`: comma-separated list of addresses that receive new-JC review requests.
- `EMAIL_REPORT_TO`: the central ReproducibiliTea account, bcc'd on every approve/reject email and the sole recipient of ignore notifications.
- `GITHUB_API_USER`, `GITHUB_TOKEN`, `GITHUB_REPO_API` (and `GITHUB_REPO_API_SANDBOX` for local/sandbox testing): used to read/write `_journal-clubs/*.md` in this (public) repo.
- `GITHUB_TOKEN_PENDING`, `GITHUB_REPO_API_PENDING` (and `GITHUB_REPO_API_PENDING_SANDBOX`): a separate fine-grained PAT (Contents: Read and write, scoped to that repo only) and API base URL for the private [`pending-journal-clubs`](https://github.com/ReproducibiliTea-org/pending-journal-clubs) repo — see below.

`AUTH_CODE` is no longer used and can be removed — JC creation now uses email confirmation + admin review instead of a shared password.

New JCs are held in the private **`pending-journal-clubs`** sibling repo (`_pending-journal-clubs/`, and `_pending-journal-clubs/ignored/` once ignored) until an admin approves them via the reviewed link, at which point they're moved into this repo's `_journal-clubs/` and go live. That repo is private because pending/ignored/rejected submissions carry organiser PII (names, emails, address, geolocation) that shouldn't be publicly readable before — or after — an admin has looked at it; admins get the submission details by email and never need webclient access to the pending repo.

A submission is first committed as an unconfirmed draft (`_pending-journal-clubs/unconfirmed/<id>.json`, in the pending repo) rather than embedded in the confirmation email's URL, so `description`/`adminNote` can run up to 10000 characters without producing an unusably long link. It's moved into `_pending-journal-clubs/` once the requester confirms; drafts that never get confirmed are pruned hourly by that repo's own GitHub Actions workflow (`pending-journal-clubs/.github/workflows/prune-drafts.yml`) after an hour.

### Rollcall (GitHub Actions)

`.github/workflows/rollcall.yml` runs daily and can also be triggered manually (with a `dry_run` option) from the Actions tab. It only handles the `_journal-clubs` messaging/deactivation cadence — unconfirmed-draft pruning lives in the `pending-journal-clubs` repo instead (see above). It needs these repository secrets:

- `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `FROM_EMAIL_ADDRESS` — same Mailgun account used by the Netlify functions.

It uses the built-in `GITHUB_TOKEN` (no personal access token needed) with `permissions: contents: write` to read and update journal club files.
