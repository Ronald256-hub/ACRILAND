# ACRILAND Fleet Command Centre

Enterprise fleet management platform for **ACRILAND LTD**.

## Phase 1 foundation

This repository starts with a secure multi-tenant foundation rather than a vehicle-only CRUD app:

- React + TypeScript + Vite responsive web application
- Node.js + TypeScript + Express REST API
- PostgreSQL + Prisma relational data model
- Organization / branch / department hierarchy
- Secure login, refresh sessions, lockouts, password reset and forced first-login password change
- Action-level RBAC
- Fleet-manager-controlled driver portal account creation (no public registration)
- Driver self-service profile photo upload with authenticated private retrieval
- Vehicle and driver master records
- Controlled vehicle status transitions
- Audit and login history
- Executive foundation dashboard
- Domain-rule tests for critical controls and uploaded-image signature validation

The full staged roadmap is documented in `docs/ARCHITECTURE.md`.

## Local start

1. Copy `.env.example` to `.env` and replace secrets.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Install dependencies: `npm install`.
4. Generate Prisma client: `npm run db:generate`.
5. Run migration: `npm run db:migrate`.
6. Set bootstrap admin variables and run `npm run bootstrap`.
7. Run `npm run dev`.

The web app runs on `http://localhost:5173`; API defaults to `http://localhost:4000`.

## Critical access rule

There is intentionally **no public user registration endpoint**. Driver portal accounts can only be provisioned by a user with the `user.create_driver` permission (Fleet Manager, Organization Administrator, or Super Administrator by default).

## Driver profile photos

Drivers with portal accounts can upload or replace their own profile photo from **My Profile**. Fleet Managers and authorized administrators can also attach/update driver photos from Driver Management. Files are size-limited, validated by binary signature (JPEG/PNG/WebP), stored under server-generated private paths, and served only through authenticated API requests. Configure `FILE_STORAGE_ROOT` on a persistent volume; production object storage can replace the local adapter without changing the driver API.

## Phase 2 fleet operations

Phase 2 adds controlled vehicle movement and driver accountability:

- one-active-driver / one-active-vehicle assignment enforcement
- trip request, independent approval/rejection and controlled allocation
- automatic temporary trip assignments when required
- mandatory pre-trip inspection before departure
- driver-controlled trip start and return with odometer validation
- mandatory post-trip inspection before management closure
- configurable digital inspection templates
- critical inspection failures automatically ground vehicles
- driver mobile home for My Vehicle, My Trips, Inspections and My Profile

After applying Phase 2 migrations to an existing environment, run `npm run sync:defaults` once to synchronize new action permissions, default role grants and standard pre/post-trip inspection templates.

## Production deployment

The recommended production topology and first-live verification checklist are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). The repository includes a production container that builds the API and web application together and serves the web app from the same HTTPS origin.
