# ACRILAND Enterprise Fleet Command Centre — Architecture Baseline

## 1. Current-system assessment

Repository inspection on 14 August 2026 found a new, empty GitHub repository with no branches or application files. There is therefore no existing application architecture to preserve.

## 2. Existing database assessment

No schema, migrations, database client, seed data, production records or connection configuration exists in the repository. Phase 1 establishes PostgreSQL with Prisma migrations. All future changes must be forward-only migrations; production resets are forbidden.

## 3. Existing functionality to preserve

None exists yet. From the first production deployment onward, backward compatibility, data retention and safe migrations become mandatory.

## 4. Security assessment

Initial repository risk is low because it contains no code or secrets. Product security requirements are high because the platform controls driver authorization, vehicle availability, financial records and compliance. Baseline controls:

- no public signup;
- Argon-equivalent-strength password hashing (bcrypt cost 12 in the initial portable implementation);
- short-lived JWT access tokens plus revocable opaque refresh sessions;
- refresh tokens stored only as hashes server-side and as HttpOnly cookies client-side;
- failed-login lockout;
- forced first-login password change;
- action-level server-side RBAC;
- organization scoping on every operational query;
- security headers, CORS allow-listing and login rate limiting;
- Zod validation at API boundaries;
- audit logging for material operations;
- no hard deletion for protected operational history.

Before internet exposure: configure TLS at the edge, use managed PostgreSQL, encrypted object storage, secret management, daily backups, monitoring, SAST/dependency scanning, SMTP credentials and production CORS.

## 5. Target architecture

```text
Browser / Android browser
        |
        v
React + TypeScript + Vite (role-aware responsive UI)
        |
      HTTPS
        |
        v
Express REST API
  |-- authentication/session service
  |-- action-level authorization
  |-- tenant scope enforcement
  |-- fleet domain modules
  |-- audit/notification adapters
        |
        v
PostgreSQL (system of record)
        |
        +--> Private file-storage adapter (driver photos now; object storage upgrade path)
        +--> GPS provider adapters (later phase)
        +--> Email/SMS/WhatsApp adapters (later phase)
```

Deployment is stateless at API/web tiers except for the development/local file-storage adapter. Production must mount `FILE_STORAGE_ROOT` on a persistent private volume or replace the adapter with encrypted object storage. GPS and notification providers remain behind adapters to avoid vendor lock-in.

## 6. Database schema strategy

Phase 1 tables:

- organizations
- branches
- departments
- users
- roles
- permissions
- role_permissions
- user_roles
- sessions
- password_reset_tokens
- login_events
- drivers
- driver_licences
- vehicles
- audit_logs

Planned extensions: assignments, trips, approvals, inspections, faults, work orders, maintenance schedules/records, parts/inventory, fuel, expenses, compliance documents, incidents, tyres, batteries, GPS devices/positions, geofences, alerts, notifications and attachments.

Every operational table carries `organization_id` directly or through an enforced parent relationship. High-volume future tables will be indexed by tenant + vehicle + date. Historical financial/maintenance records will be voided/archived rather than deleted.

## 7. Module structure

Backend modules are grouped by domain (`auth`, `users`, `branches`, `departments`, `vehicles`, `drivers`, `dashboard`, `audit`) with centralized middleware for authentication, authorization, error handling and audit capture. Frontend pages mirror business modules, not database tables.

## 8. Navigation structure

### Management desktop

- Command Centre
- Fleet
  - Vehicles
  - Drivers
  - Assignments (Phase 2)
  - Trips (Phase 2)
  - Inspections (Phase 2)
- Workshop (Phase 3)
- Fuel (Phase 4)
- Inventory (Phase 5)
- Compliance (Phase 6)
- Costs & TCO (Phase 7)
- Incidents / Tyres / Batteries (Phase 8)
- Live Map & Geofences (Phase 9)
- Reports & Analytics (Phase 10)
- Administration
  - Users
  - Branches
  - Departments
  - Audit log
  - Settings

### Driver mobile home

Phase 1 includes **My Profile** with authenticated driver self-service profile-photo upload. Phase 2 adds My Vehicle, Today’s Trip, Start Inspection, Report Fault, Report Accident, Record Fuel, Request Trip, SOS/Breakdown and My Documents.

## 9. Permission matrix baseline

| Capability | Super Admin | Org Admin | Fleet Manager | Workshop Manager | Technician | Driver | Finance | Director |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| user.create | ✓ | ✓ | — | — | — | — | — | — |
| user.create_driver | ✓ | ✓ | ✓ | — | — | — | — | — |
| user.disable | ✓ | ✓ | ✓* | — | — | — | — | — |
| branch.manage | ✓ | ✓ | — | — | — | — | — | — |
| vehicle.create/edit | ✓ | ✓ | ✓ | — | — | — | — | view |
| driver.create/edit | ✓ | ✓ | ✓ | — | — | — | — | view |
| driver.view_self | ✓ | ✓ | — | — | — | ✓ | — | — |
| driver.photo.manage | ✓ | ✓ | ✓ | — | — | — | — | — |
| driver.photo.upload_self | ✓ | ✓ | — | — | — | ✓ | — | — |
| audit.view | ✓ | ✓ | ✓ | limited | — | — | limited | view |
| trip.request | ✓ | ✓ | ✓ | — | — | ✓ | — | — |
| trip.approve | ✓ | ✓ | ✓ | — | — | **never own** | — | high-value view |
| maintenance.approve | ✓ | ✓ | ✓ | ✓ | **never own major repair** | — | cost view | high-value |
| fuel.approve | ✓ | ✓ | ✓ | — | — | **never own adjustment** | ✓ | view |
| report.export | ✓ | ✓ | ✓ | ✓ | limited | own | ✓ | ✓ |

`*` Fleet Manager authority is intended for driver portal accounts only and is enforced by route policy.

## 10. Implementation phases

1. Foundation — architecture, DB, auth, RBAC, org/branch/user, vehicle, driver, audit.
2. Fleet operations — assignment, trips, inspections, status engine.
3. Workshop — faults, job cards, preventive maintenance, technician workflow.
4. Fuel — transactions, efficiency, anomalies.
5. Inventory — parts, suppliers, receiving, issues/transfers/reorder.
6. Compliance — documents, licences, expiry alerts.
7. Financial control — expenses, cost/km, TCO.
8. Advanced assets — tyre, battery, accident, handover.
9. GPS/telematics — adapter API, live map, geofences, speed/idle.
10. Analytics/reporting — executive KPI suite and PDF/Excel/CSV exports.

## 11. Risks

- GPS vendor protocols are unknown; adapter boundaries must remain stable until vendor selection.
- Uganda/local compliance requirements and company-specific approval limits need formal confirmation before compliance logic is made legally prescriptive.
- Poor odometer/fuel source data can undermine analytics; anomaly scoring must distinguish suspected data quality from misconduct.
- Driver photos, licences, medical references and location data are sensitive; data-retention and access policies are required.
- Offline/low-connectivity driver workflows may need a PWA synchronization layer after field testing.
- Fuel cards, workshop procurement and accounting integrations depend on third-party APIs not yet selected.

## 12. Migration strategy

- Use numbered Prisma migrations committed to source control.
- Never run `migrate reset` against shared/production databases.
- Add nullable/backfilled fields before making them required in high-volume production migrations.
- Prefer additive schema changes; use dual-read/dual-write when replacing critical fields.
- Back up and verify restore before destructive migrations.
- Treat vehicle, driver, maintenance, fuel and audit history as retention-protected data.
- Deploy schema first when application code is backward-compatible, then code, then cleanup in a later migration.

## Phase completion standard

A phase is complete only after schema migration, API, UI, validation, permission checks, audit coverage, tests, type/build checks and regression verification have passed in an environment with dependencies and PostgreSQL available.
