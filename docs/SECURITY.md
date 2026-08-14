# Security baseline

- No public registration route exists.
- Tenant identity is resolved server-side from the authenticated session; clients cannot select arbitrary organization IDs for operational writes.
- Access tokens are short-lived JWTs; refresh tokens are opaque, rotated and revocable.
- Passwords are hashed with bcrypt cost 12 and never logged.
- Login attempts are rate-limited and accounts lock after repeated failures.
- Authorization uses action keys, evaluated on the API for every protected operation.
- Material creates/updates/status changes are recorded in `audit_logs`.
- Production requires HTTPS, strong secrets, restricted CORS, managed backups and external secret storage.
- Driver profile uploads use binary signature validation, configurable size limits, server-generated filenames and private authenticated retrieval; client filenames are never trusted.
- The local file-storage adapter must point to a persistent non-public volume in production. Before broader document uploads, add malware scanning and an encrypted object-storage adapter.
- Driver self-service permissions are separated from global driver-directory permissions: a driver may view/upload their own profile without gaining access to browse all drivers.
