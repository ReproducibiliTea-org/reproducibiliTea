# reproducibiliTea

![Jekyll site CI](https://github.com/mjaquiery/reproducibiliTea/workflows/Jekyll%20site%20CI/badge.svg)
[![Netlify Status](https://api.netlify.com/api/v1/badges/7cff052d-97ff-42ac-b2d8-f4ee29cb10d7/deploy-status)](https://app.netlify.com/sites/rpt-org/deploys)

Website for the ReproducibiliTea Journal Club and Podcast

## Runtime configuration

The Netlify functions under `src/` now use MongoDB for storing and validating edit tokens. Configure the following environment variables for deployments:

- `MONGODB_URI`: connection string for the MongoDB instance.
- `MONGODB_DB`: database name that contains the `editTokens` collection.

The previous FaunaDB secret (`FAUNA_KEY`) is no longer used and can be removed.

When you are using MongoDB programmatic API keys (with `publicKey` and `privateKey` components), build the URI the same way you would for a standard username/password account by placing the `publicKey` before the colon and the `privateKey` after it:

```
mongodb+srv://<publicKey>:<privateKey>@<cluster-host>/<database>?retryWrites=true&w=majority
```

For standalone or replica set hosts without DNS SRV, drop the `+srv` and list the hostname(s) and port(s):

```
mongodb://<publicKey>:<privateKey>@<host1>:<port>,<host2>:<port>/<database>
```

Percent-encode any special characters in the key strings to keep the URI valid.

### Dependency install note

The MongoDB driver is published as the `mongodb` package on the public npm registry. If `npm install` fails with a 403 from `https://registry.npmjs.org/mongodb`, it usually indicates a registry access or proxy policy issue in the local environment rather than a package rename. Confirm your npm registry configuration and any proxy credentials before retrying.
