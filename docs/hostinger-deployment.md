# Hostinger deployment plan

No deployment, purchases or DNS changes are performed by this change. The tested
target is Node 22.23.3, Wasp 0.18.0, PostgreSQL 16 and one backend process on Linux.

## Hosting layout

Use a Hostinger **VPS** with Linux, Node 22 (minimum 22.12), PostgreSQL and Nginx.
An existing managed Node plan is usable only if it supports this Node version,
the generated Wasp layout, background jobs, native LibSQL dependencies and
persistent storage. Shared static/PHP hosting alone cannot run the backend or
PostgreSQL. The built frontend may be served from shared hosting separately.

| Component | Location | Artifact / command |
| --- | --- | --- |
| Frontend | Nginx or Hostinger static hosting, `https://app.example.com` | `.wasp/build/web-app/build/` |
| Backend | VPS service, `https://api.example.com`, reverse proxy to port 3001 | `npm start` from repository root |
| Database | Private PostgreSQL 16 on VPS or external PostgreSQL | `DATABASE_URL`; migrations applied by `npm start` |
| Agent memory | Persistent writable VPS directory | `MASTRA_STORAGE_URL=file:/var/lib/recipe-agent/memory.db` |
| Email | Real SMTP mailbox/service | SMTP variables and a verified sender |
| Images | S3 bucket | AWS variables, CORS and bucket access policy |

Keep one backend replica while using a local LibSQL file. Back up PostgreSQL
and the LibSQL file (use a SQLite-aware backup or stop the service to capture
the database and its WAL files consistently). Agent memory must live outside
the release directory. PgBoss uses PostgreSQL for scheduled jobs; no separate
Mastra HTTP service is required because Wasp imports Mastra into its backend.

## Build and release

Install Node 22 and Wasp 0.18.0 using their official instructions with TLS and
checksum verification enabled. Use the selected repository checkout, not a
second worktree. On a fresh checkout the local `wasp` dependency does not exist
until Wasp generates `.wasp/out/sdk/wasp`; do not begin with a blind `npm ci`.

From the repository root:

```bash
REACT_APP_API_URL=https://api.example.com npm run build
```

The build script runs, in order:

```bash
wasp build
npm --prefix .wasp/build/server run bundle
npm --prefix .wasp/build/web-app run build
```

`wasp build` generates the SDK, Prisma client and production projects and installs
their dependencies. The script prevents npm from saving incidental manifest or
lockfile edits. The root lockfile is committed; after generation `npm ci` can
refresh the root installation, but then regenerate Prisma with
`npx prisma generate --schema .wasp/build/db/schema.prisma` before bundling.
Never use `npm run mastra:dev`, `wasp start`, or `vite preview` as a production build
or production web server. No OpenAI, Stripe, SMTP or database credential is needed
to compile; runtime variables are validated when the server starts.

Build on the target OS/architecture, or use the generated Wasp Dockerfile if
containerizing, to preserve native Prisma/LibSQL compatibility. For a direct VPS
release retain the source, root `package*.json`, root `node_modules`,
`.wasp/out/sdk/wasp`, and `.wasp/build` including its server dependencies and bundle.
Copying `bundle/server.js` alone is insufficient. Generated Docker deployment
has not been tested here. The default generated Dockerfile serves the backend;
serve the frontend artifact separately.

Before changing an existing production database, take a backup and review the
SQL in `migrations/`. The initial migration targets an **empty** database and
includes Wasp's authentication tables. If importing an existing populated
database, verify the complete schema and baseline the migration using Prisma's
documented workflow; do not reset it or apply the initial migration blindly.
For subsequent schema changes use `wasp db migrate-dev` against development,
review and commit the generated migrations, and deploy with `migrate deploy`.

With runtime variables injected securely:

```bash
npm start
```

This runs Prisma `migrate deploy` before the production backend. Run as an
unprivileged service account with a process supervisor such as systemd; set its
working directory to the repository root and provide a private environment file
outside the repository. Create the memory directory with write access for that
account. Start PostgreSQL first. Configure restart on failure and log collection.
During releases stop the old backend before starting the new one; do not run
concurrent migrations or two replicas against the same SQLite file.

## Environment variables

| Variable | Stage | Requirement |
| --- | --- | --- |
| `REACT_APP_API_URL` | Frontend build | Public HTTPS backend origin; changing it requires rebuilding frontend |
| `NODE_ENV` | Backend | `production` (set by the start command) |
| `PORT` | Backend | `3001`, behind the reverse proxy |
| `DATABASE_URL` | Backend/migrations | PostgreSQL application role and database; private access, TLS for remote DB |
| `JWT_SECRET` | Backend | Securely generated stable random secret; never commit it |
| `WASP_WEB_CLIENT_URL` | Backend | Public frontend origin; used for CORS, auth links and checkout redirects |
| `WASP_SERVER_URL` | Backend | Public HTTPS backend origin |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | Backend | Required SMTP settings; for Hostinger email verify the mailbox settings (typically `smtp.hostinger.com:587` with STARTTLS) |
| `MASTRA_STORAGE_URL` | Backend | Absolute `file:` URL on persistent storage |
| `OPENAI_API_KEY` | AI requests | Required for chat, embeddings and thumbnails; no placeholder fallback |
| `STRIPE_API_KEY` | Payments/revenue jobs | Real Stripe key for the appropriate test/live mode |
| `STRIPE_WEBHOOK_SECRET` | Payments | Signing secret for this deployment's webhook |
| `STRIPE_CUSTOMER_PORTAL_URL` | Payments | Configured customer portal URL |
| `PAYMENTS_HOBBY_SUBSCRIPTION_PLAN_ID`, `PAYMENTS_PRO_SUBSCRIPTION_PLAN_ID`, `PAYMENTS_CREDITS_10_PLAN_ID` | Payments | Corresponding Stripe price identifiers |
| `AWS_S3_IAM_ACCESS_KEY`, `AWS_S3_IAM_SECRET_KEY`, `AWS_S3_FILES_BUCKET`, `AWS_S3_REGION` | Image/upload requests | Real S3 credentials and bucket configuration |
| `ADMIN_EMAILS` | Signup | Optional comma-separated administrator emails |
| `PLAUSIBLE_API_KEY`, `PLAUSIBLE_SITE_ID`, `PLAUSIBLE_BASE_URL` | Analytics job | Required if retaining the current Plausible analytics job |

Only public values belong in `REACT_APP_*` variables. Keep all keys on the backend.
The cloud platform reserves `OPENAI_*` secret binding names: if using the cloud
binding `RECIPE_OPENAI_API_KEY`, export it as `OPENAI_API_KEY` only in the backend
process. This alias is unnecessary on a normal VPS.

Set both `auth.methods.email.fromField.email` and `emailSender.defaultFrom.email`
in `main.wasp` to an authorized sender for the SMTP mailbox before a real release,
and rebuild. The current `me@example.com` is a template value. Also remove/replace
the placeholder Plausible tags in `main.wasp` before enabling analytics.
Production email verification stays enforced; `SKIP_EMAIL_VERIFICATION_IN_DEV`
does not bypass it in the production-generated application.

## Reverse proxy and frontend

Serve the frontend artifact with SPA fallback (`try_files $uri $uri/ /index.html`
in Nginx, or equivalent rewrite rules on static hosting). Use valid HTTPS
certificates for frontend and backend. Proxy the backend origin to
`http://127.0.0.1:3001`, preserving `Host`, `X-Forwarded-For` and
`X-Forwarded-Proto`. Disable proxy buffering and set an appropriate read timeout
for the recipe streaming route. Do not expose PostgreSQL publicly. Configure S3
CORS for the frontend origin and ensure thumbnail objects can be read under the
chosen policy; the current upload code returns public object URLs.

Wasp's backend root returns HTTP 200 as a liveness probe. Readiness additionally
requires database connectivity/migrations and an authenticated operation.
Publish DNS or configure the Stripe webhook only as a separate approved release
step. No Hostinger plan, DNS, certificates or live integrations were verified by
these local tests.

## Local production smoke test

Use a disposable local PostgreSQL database and a Mailpit SMTP inbox. The cloud
instance already has `recipe-onboarding-db` (PostgreSQL 16) and
`recipe-onboarding-mail` (Mailpit 1.29.3). To reproduce the mail service:

```bash
docker run -d --name recipe-onboarding-mail \
  -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 \
  -e MP_SMTP_AUTH_ACCEPT_ANY=1 -e MP_SMTP_AUTH_ALLOW_INSECURE=1 \
  axllent/mailpit:v1.29.3
```

Set local runtime variables (the SMTP values below are local test settings):

```bash
export DATABASE_URL=postgresql://postgres@127.0.0.1:5432/recipe_dev
export WASP_WEB_CLIENT_URL=http://localhost:3000
export WASP_SERVER_URL=http://localhost:3001
export SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_USERNAME=local SMTP_PASSWORD=local
export MASTRA_STORAGE_URL=file:/absolute/writable/test-data/memory.db
export JWT_SECRET="$(openssl rand -hex 32)"
unset OPENAI_API_KEY STRIPE_API_KEY LEMONSQUEEZY_API_KEY
REACT_APP_API_URL=http://localhost:3001 npm run build
npm start
```

In a second terminal, serve the built client for local validation:

```bash
npm --prefix .wasp/build/web-app run preview -- --host 127.0.0.1 --port 3000
```

In a third terminal, set the same local `DATABASE_URL` and run:

```bash
npm run test:smoke
```

The three tests validate the frontend HTML/asset, anonymous access rejection,
SMTP email verification, login, and recipe create/read/favorite/delete through
Wasp and Prisma. They remove only their own temporary account and email. They
accept only loopback service URLs. AI calls, paid checkout, S3 uploads, live
SMTP, analytics providers and Hostinger operation remain untested.
