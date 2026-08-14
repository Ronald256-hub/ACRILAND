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
