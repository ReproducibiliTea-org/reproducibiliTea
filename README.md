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
- `GITHUB_API_USER`, `GITHUB_TOKEN`, `GITHUB_REPO_API` (and `GITHUB_REPO_API_SANDBOX` for local/sandbox testing): unchanged, used to read/write `_journal-clubs/*.md` and `_pending-journal-clubs/*.md`.

`AUTH_CODE` is no longer used and can be removed — JC creation now uses email confirmation + admin review instead of a shared password.

New JCs are held in `_pending-journal-clubs/` (and `_pending-journal-clubs/ignored/` once ignored) until an admin approves them via the reviewed link, at which point they're moved into `_journal-clubs/` and go live. Neither pending directory is a Jekyll collection — same convention as the existing `_inactive-journal-clubs/` archive — so nothing in either is ever built onto the public site.

A submission is first committed as an unconfirmed draft (`_pending-journal-clubs/unconfirmed/<id>.json`) rather than embedded in the confirmation email's URL, so `description`/`adminNote` can run up to 10000 characters without producing an unusably long link. It's moved into `_pending-journal-clubs/` once the requester confirms; drafts that never get confirmed are pruned by the rollcall cron (see below) after an hour.

### Rollcall (GitHub Actions)

`.github/workflows/rollcall.yml` runs daily and can also be triggered manually (with a `dry_run` option) from the Actions tab. It needs these repository secrets:

- `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `FROM_EMAIL_ADDRESS` — same Mailgun account used by the Netlify functions.

It uses the built-in `GITHUB_TOKEN` (no personal access token needed) with `permissions: contents: write` to read and update journal club files.
