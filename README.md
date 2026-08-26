# reproducibiliTea

![Jekyll site CI](https://github.com/mjaquiery/reproducibiliTea/workflows/Jekyll%20site%20CI/badge.svg)
[![Netlify Status](https://api.netlify.com/api/v1/badges/7cff052d-97ff-42ac-b2d8-f4ee29cb10d7/deploy-status)](https://app.netlify.com/projects/rpt-org/deploys)

Website for the ReproducibiliTea Journal Club and Podcast

## Runtime configuration

### Netlify functions (`src/`)

The Netlify functions under `src/` still use MongoDB for storing and validating edit tokens (this is being removed in a follow-up change). Configure:

- `MONGODB_URI`: connection string for the MongoDB instance.
- `MONGODB_DB`: database name that contains the `editTokens` collection.

The previous FaunaDB secret (`FAUNA_KEY`) is no longer used and can be removed.

### Rollcall (GitHub Actions)

`.github/workflows/rollcall.yml` runs daily and can also be triggered manually (with a `dry_run` option) from the Actions tab. It needs these repository secrets:

- `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `FROM_EMAIL_ADDRESS` — same Mailgun account used by the Netlify functions.

It uses the built-in `GITHUB_TOKEN` (no personal access token needed) with `permissions: contents: write` to read and update journal club files.
