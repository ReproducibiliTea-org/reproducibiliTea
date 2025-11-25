# reproducibiliTea

![Jekyll site CI](https://github.com/mjaquiery/reproducibiliTea/workflows/Jekyll%20site%20CI/badge.svg)
[![Netlify Status](https://api.netlify.com/api/v1/badges/7cff052d-97ff-42ac-b2d8-f4ee29cb10d7/deploy-status)](https://app.netlify.com/sites/rpt-org/deploys)

Website for the ReproducibiliTea Journal Club and Podcast

## Runtime configuration

The Netlify functions under `src/` now use MongoDB for storing and validating edit tokens. Configure the following environment variables for deployments:

- `MONGODB_URI`: connection string for the MongoDB instance.
- `MONGODB_DB`: database name that contains the `editTokens` collection.

The previous FaunaDB secret (`FAUNA_KEY`) is no longer used and can be removed.
