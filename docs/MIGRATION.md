# Database migration policy

1. Take and verify a backup before production schema changes.
2. Review generated SQL before applying it.
3. Apply additive changes first.
4. Backfill in bounded batches for large tables.
5. Add restrictive constraints only after backfill validation.
6. Never delete fleet financial/maintenance/audit history to make a migration succeed.
7. Roll application changes in a backward-compatible sequence.
8. Document rollback or forward-fix procedure for every risky migration.
9. After migrations that add permissions or system templates, run `npm run sync:defaults` and verify role grants before reopening the application to users.
