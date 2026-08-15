# Phase 5 — Control & Intelligence

Phase 5 extends ACRILAND Fleet Command Centre with dispatch scheduling, connected-fleet boundaries, transparent driver safety scoring, supplier master data, lifecycle/TCO governance, controlled disposal and operational notification delivery.

## Movement control

Dispatch planning sits downstream of Trip Control. A dispatch plan requires an approved/allocated trip with both a driver and vehicle. Readiness checks refuse blocked vehicle states or drivers who are not currently authorized to operate. A dispatch can only become `DISPATCHED` after the underlying trip has already become `ACTIVE` through the existing trip authorization and inspection workflow. Dispatch completion likewise requires the trip to be `CLOSED` first.

The API prevents overlapping active dispatch windows for the same vehicle or driver. This is an application-level scheduling guard; future high-volume planning can additionally use PostgreSQL exclusion constraints if dispatch concurrency warrants it.

## Routes and geofences

Reusable route plans hold origin, destination, optional waypoint information, expected distance and duration. Geofences support circle and polygon geometry at the API/data layer, with `MONITOR`, `ALLOWED` and `RESTRICTED` policies plus optional speed limits.

The initial management UI creates circle geofences; polygon creation is available through the API and can be added to the visual editor in a later UX increment.

Geofence evaluation consumes the latest normalized telemetry snapshot for each connected vehicle. It persists inside/outside state and emits entry/exit events when state changes. Restricted-zone entry and allowed-zone exit are treated as policy breaches. Speed-limit exceptions create transparent driver-safety evidence. Geofences never authorize movement; Trip Control remains the movement authority.

## Driver safety score

The score is intentionally transparent rather than predictive:

`score = clamp(100 - safety event points - incident points - failed inspection points, 0, 100)`

Risk bands are:
- `EXCELLENT`: 90–100
- `GOOD`: 80–89
- `WATCH`: 70–79
- `HIGH_RISK`: below 70

The default recalculation window is 90 days and can be requested from 30–365 days. Drivers can view only their own score and evidence and cannot edit or recalculate it.

## Vendors and lifecycle/TCO

The vendor master controls supplier identity, category, contacts, tax reference, payment terms, status and an optional 1–5 rating.

Vehicle TCO combines:
- vehicle acquisition price,
- issued fuel transaction cost,
- closed maintenance work-order cost,
- additional controlled lifecycle costs such as tyres, insurance, licensing, tax, tolls, parking, accident costs and other approved expenses.

Manual TCO entry deliberately excludes acquisition, fuel and maintenance categories because those values are already sourced from authoritative fleet records and duplicate entry would inflate TCO.

## Disposal control

Disposal follows maker/checker separation. The requester cannot approve the same request at either the API or database layer. Only an independently approved request may be completed. Completion is blocked while the vehicle has an active assignment, active/returning trip, or active workshop order. Successful completion is the action that changes the vehicle status to `DISPOSED`.

## Notification delivery

Operational alert email delivery is opt-in. Authorized users can enable email delivery, defaulting to critical alerts only. Queueing requires an active user who still has `alert.view` permission. Each alert/user/channel tuple is deduplicated into a persistent delivery ledger with attempts, sent time and failure evidence. Failed email deliveries are retried up to three attempts.

The repository includes the scheduler-ready command:

`npm run notifications:run -w @acriland/api`

This command queues eligible operational alerts for active organizations and dispatches pending email deliveries. **It is not a live scheduler by itself.** Production deployment must invoke it through the hosting platform's cron/scheduled-job facility at an approved cadence. SMTP must also be configured in production; missing SMTP configuration is treated as delivery failure rather than silently succeeding.

## Phase 5 release gate

Do not consider Phase 5 complete until a clean PostgreSQL database has applied all migrations and the repository passes Prisma generation, strict API and web TypeScript checks, automated domain/database tests, production dependency audit and production builds. The merged `main` commit must be validated again after merge.
