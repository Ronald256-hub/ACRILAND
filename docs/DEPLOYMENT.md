# ACRILAND production deployment

## Recommended topology

Deploy the repository as one application service backed by one managed PostgreSQL database.

The container builds both workspaces, serves the Vite production build from the API service, and keeps browser requests on the same HTTPS origin:

- Browser: `https://your-domain.example/`
- API: `https://your-domain.example/api/*`
- Health: `https://your-domain.example/api/health`

This is the preferred topology for the current web application because authentication refresh cookies remain same-origin.

## Production environment

Set these variables in the hosting provider, never in Git:

- `NODE_ENV=production`
- `PORT` — use the provider's injected port when the platform requires it; otherwise `4000`
- `DATABASE_URL` — managed PostgreSQL connection string
- `JWT_ACCESS_SECRET` — long random secret, 32+ characters
- `ACCESS_TOKEN_TTL_MINUTES=15`
- `REFRESH_TOKEN_TTL_DAYS=14`
- `CORS_ORIGIN=https://your-domain.example`
- `APP_URL=https://your-domain.example`
- `BOOTSTRAP_ORG_NAME=ACRILAND LTD`
- `BOOTSTRAP_ORG_SLUG=acriland`
- `BOOTSTRAP_ADMIN_EMAIL=...`
- `BOOTSTRAP_ADMIN_PASSWORD=...`
- `FILE_STORAGE_ROOT=./data/uploads` only when the runtime has persistent storage

SMTP variables can be added when email delivery is enabled.

## Database initialization

On the first release:

1. Run `npm run db:generate`.
2. Run `npm run db:deploy`.
3. Run `npm run bootstrap` once with a dedicated bootstrap administrator credential.
4. Run `npm run sync:defaults` after migrations when platform defaults need synchronization.

Do not use `prisma migrate dev` against production.

## Persistent files

Driver photos and private fleet documents are stored through the configured file storage root. A production deployment must attach persistent storage or replace the adapter with durable object storage before relying on uploaded records.

## First-live verification

After deployment, verify:

1. `/api/health` returns HTTP 200.
2. The login page loads over HTTPS.
3. The bootstrap administrator can sign in and is forced through the initial password-change flow.
4. A vehicle can be registered and appears in Vehicle Operations.
5. A driver can be registered and an authorized driver account can be provisioned.
6. GPS telemetry can be ingested and appears in Fleet Tracking.
7. Vehicle 360 shows location, driver/custodian and operating history.
8. Vendor records remain internal and do not create external user accounts.
9. Critical status transitions require reasons and appear in the audit trail.
10. A disposed vehicle cannot be archived until the disposal workflow has completed.

## App conversion

The web client includes an installable manifest and service-worker shell. Its API base can be overridden with `VITE_API_BASE_URL` for a separately hosted API when required. The default remains same-origin `/api`, which is the recommended production configuration today.

For a native Android/iOS wrapper later, the existing route structure and role-specific workflows can be retained while replacing selected browser capabilities with native camera, location, notifications and offline storage adapters.
