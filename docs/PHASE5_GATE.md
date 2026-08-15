# Phase 5 merge gate

Phase 5 must not merge until PostgreSQL migration deployment, Prisma generation, strict API/web TypeScript checks, automated tests, production dependency audit and production builds are green. After squash merge, the exact `main` commit must pass the same CI gate again.
