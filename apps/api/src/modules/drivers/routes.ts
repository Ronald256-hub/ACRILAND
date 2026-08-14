import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { audit } from "../../lib/audit.js";
import { hashPassword } from "../../lib/password.js";
import { PERMISSIONS } from "../../domain/permissions.js";
import { effectiveDriverStatus } from "../../domain/rules.js";
import { requirePermission } from "../../middleware/authorize.js";
import { assertTenantReferences } from "../../lib/tenantRefs.js";
import { env } from "../../config/env.js";
import { detectSupportedImageMime } from "../../lib/imageFiles.js";
import { deletePrivateFile, readPrivateFile, saveDriverPhoto } from "../../lib/fileStorage.js";

export const driversRouter = Router();

const driverSchema = z.object({
  employeeNumber: z.string().min(1).max(50),
  fullName: z.string().min(2).max(120),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  nationalIdRef: z.string().max(80).optional(),
  licenceNumber: z.string().min(3).max(80),
  licenceClass: z.string().min(1).max(30),
  licenceIssueDate: z.coerce.date().optional(),
  licenceExpiry: z.coerce.date(),
  emergencyContact: z.string().max(200).optional(),
  branchId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
  createPortalAccount: z.boolean().default(false),
  temporaryPassword: z.string().min(12).max(128).optional()
});

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: Math.floor(env.MAX_PROFILE_PHOTO_MB * 1024 * 1024) }
}).single("photo");

function hasPermission(req: Request, permission: string) {
  return req.auth!.permissions.has(permission);
}

function canReadDriver(req: Request, driver: { userId: string | null }) {
  return hasPermission(req, PERMISSIONS.DRIVER_VIEW) ||
    (driver.userId === req.auth!.userId && hasPermission(req, PERMISSIONS.DRIVER_VIEW_SELF));
}

function canManagePhoto(req: Request, driver: { userId: string | null }) {
  return hasPermission(req, PERMISSIONS.DRIVER_PHOTO_MANAGE) ||
    (driver.userId === req.auth!.userId && hasPermission(req, PERMISSIONS.DRIVER_PHOTO_UPLOAD_SELF));
}

function publicDriver<T extends { photoUrl?: string | null; id: string; updatedAt: Date }>(driver: T) {
  const { photoUrl, ...safe } = driver;
  return {
    ...safe,
    photoAvailable: Boolean(photoUrl),
    photoEndpoint: photoUrl ? `/api/drivers/${driver.id}/photo?v=${driver.updatedAt.getTime()}` : null
  };
}

driversRouter.get("/me", requirePermission(PERMISSIONS.DRIVER_VIEW_SELF), async (req, res) => {
  const driver = await prisma.driver.findFirst({
    where: { organizationId: req.auth!.organizationId, userId: req.auth!.userId, archivedAt: null },
    include: { branch: true, department: true, user: { select: { id: true, status: true, lastLoginAt: true } } }
  });
  if (!driver) return res.status(404).json({ error: "No driver profile is linked to your account." });
  return res.json(publicDriver(driver));
});

driversRouter.get("/", requirePermission(PERMISSIONS.DRIVER_VIEW), async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const take = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
  const q = String(req.query.q ?? "").trim();
  const where = {
    organizationId: req.auth!.organizationId,
    archivedAt: null,
    ...(q ? { OR: [
      { fullName: { contains: q, mode: "insensitive" as const } },
      { employeeNumber: { contains: q, mode: "insensitive" as const } },
      { licenceNumber: { contains: q, mode: "insensitive" as const } }
    ] } : {})
  };
  const [items, total] = await prisma.$transaction([
    prisma.driver.findMany({
      where,
      skip: (page - 1) * take,
      take,
      orderBy: { fullName: "asc" },
      include: { branch: true, department: true, user: { select: { id: true, status: true, lastLoginAt: true } } }
    }),
    prisma.driver.count({ where })
  ]);
  return res.json({ items: items.map(publicDriver), total, page, limit: take });
});

driversRouter.post("/", requirePermission(PERMISSIONS.DRIVER_CREATE), async (req, res) => {
  const input = driverSchema.parse(req.body);
  if (input.createPortalAccount && !hasPermission(req, PERMISSIONS.USER_CREATE_DRIVER)) {
    return res.status(403).json({ error: "You cannot create driver portal accounts." });
  }
  await assertTenantReferences(req.auth!.organizationId, input.branchId, input.departmentId);
  if (input.createPortalAccount && (!input.email || !input.temporaryPassword)) {
    return res.status(400).json({ error: "Email and a temporary password are required for portal access." });
  }
  const status = effectiveDriverStatus("ACTIVE", input.licenceExpiry) as "ACTIVE" | "LICENCE_EXPIRED";
  const created = await prisma.$transaction(async (tx) => {
    let userId: string | undefined;
    if (input.createPortalAccount) {
      const role = await tx.role.findUnique({ where: { organizationId_name: { organizationId: req.auth!.organizationId, name: "DRIVER" } } });
      if (!role) throw new Error("DRIVER role is not configured.");
      const user = await tx.user.create({
        data: {
          organizationId: req.auth!.organizationId,
          branchId: input.branchId,
          departmentId: input.departmentId,
          email: input.email!.toLowerCase(),
          fullName: input.fullName,
          phone: input.phone,
          passwordHash: await hashPassword(input.temporaryPassword!),
          mustChangePassword: true,
          roles: { create: { roleId: role.id } }
        }
      });
      userId = user.id;
    }
    return tx.driver.create({
      data: {
        organizationId: req.auth!.organizationId,
        branchId: input.branchId,
        departmentId: input.departmentId,
        userId,
        employeeNumber: input.employeeNumber,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email?.toLowerCase(),
        nationalIdRef: input.nationalIdRef,
        licenceNumber: input.licenceNumber,
        licenceClass: input.licenceClass,
        licenceIssueDate: input.licenceIssueDate,
        licenceExpiry: input.licenceExpiry,
        emergencyContact: input.emergencyContact,
        notes: input.notes,
        status
      }
    });
  });
  await audit(req, { action: "CREATE", recordType: "DRIVER", recordId: created.id, newValue: { ...created, portalAccount: input.createPortalAccount } });
  return res.status(201).json(publicDriver(created));
});

driversRouter.get("/:id/photo", async (req, res) => {
  const driver = await prisma.driver.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId, archivedAt: null },
    select: { id: true, userId: true, photoUrl: true, updatedAt: true }
  });
  if (!driver || !canReadDriver(req, driver)) return res.status(404).json({ error: "Driver photo not found." });
  if (!driver.photoUrl) return res.status(404).json({ error: "Driver photo not found." });
  const buffer = await readPrivateFile(driver.photoUrl);
  const mime = detectSupportedImageMime(buffer);
  if (!mime) return res.status(500).json({ error: "Stored driver photo is invalid." });
  res.set({
    "Content-Type": mime,
    "Content-Disposition": "inline",
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff"
  });
  return res.send(buffer);
});

driversRouter.post("/:id/photo", (req, res, next) => {
  photoUpload(req, res, (error) => error ? next(error) : next());
}, async (req, res) => {
  const driver = await prisma.driver.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId, archivedAt: null },
    select: { id: true, userId: true, photoUrl: true, updatedAt: true }
  });
  if (!driver || !canManagePhoto(req, driver)) return res.status(404).json({ error: "Driver not found." });
  if (!req.file) return res.status(400).json({ error: "Choose a profile photo to upload." });
  const mime = detectSupportedImageMime(req.file.buffer);
  if (!mime) return res.status(415).json({ error: "Profile photo must be a valid JPEG, PNG, or WebP image." });

  const newLocator = await saveDriverPhoto({
    organizationId: req.auth!.organizationId,
    driverId: driver.id,
    buffer: req.file.buffer,
    mime
  });
  try {
    const updated = await prisma.driver.update({ where: { id: driver.id }, data: { photoUrl: newLocator } });
    await audit(req, {
      action: "UPDATE",
      recordType: "DRIVER_PHOTO",
      recordId: driver.id,
      oldValue: { photoAvailable: Boolean(driver.photoUrl) },
      newValue: { photoAvailable: true, mime, bytes: req.file.size }
    });
    await deletePrivateFile(driver.photoUrl).catch((error) => console.error("Unable to delete replaced driver photo", error));
    return res.json(publicDriver(updated));
  } catch (error) {
    await deletePrivateFile(newLocator).catch(() => undefined);
    throw error;
  }
});

driversRouter.delete("/:id/photo", async (req, res) => {
  const driver = await prisma.driver.findFirst({
    where: { id: req.params.id, organizationId: req.auth!.organizationId, archivedAt: null },
    select: { id: true, userId: true, photoUrl: true }
  });
  if (!driver || !canManagePhoto(req, driver)) return res.status(404).json({ error: "Driver not found." });
  if (!driver.photoUrl) return res.status(204).end();
  await prisma.driver.update({ where: { id: driver.id }, data: { photoUrl: null } });
  await audit(req, {
    action: "UPDATE",
    recordType: "DRIVER_PHOTO",
    recordId: driver.id,
    oldValue: { photoAvailable: true },
    newValue: { photoAvailable: false }
  });
  await deletePrivateFile(driver.photoUrl).catch((error) => console.error("Unable to delete driver photo", error));
  return res.status(204).end();
});

driversRouter.patch("/:id", requirePermission(PERMISSIONS.DRIVER_EDIT), async (req, res) => {
  const input = driverSchema.omit({ createPortalAccount: true, temporaryPassword: true }).partial().extend({
    status: z.enum(["ACTIVE", "OFF_DUTY", "LEAVE", "SUSPENDED", "LICENCE_EXPIRED", "INACTIVE"]).optional(),
    reason: z.string().max(500).optional()
  }).parse(req.body);
  const current = await prisma.driver.findFirst({ where: { id: req.params.id, organizationId: req.auth!.organizationId, archivedAt: null } });
  if (!current) return res.status(404).json({ error: "Driver not found." });
  await assertTenantReferences(req.auth!.organizationId, input.branchId ?? current.branchId ?? undefined, input.departmentId ?? current.departmentId ?? undefined);
  const expiry = input.licenceExpiry ?? current.licenceExpiry;
  const status = effectiveDriverStatus(input.status ?? current.status, expiry) as never;
  const { reason, ...rest } = input;
  const updated = await prisma.driver.update({ where: { id: current.id }, data: { ...rest, status } });
  if (current.userId && ["SUSPENDED", "INACTIVE", "LICENCE_EXPIRED"].includes(String(status))) {
    await prisma.user.update({ where: { id: current.userId }, data: { status: "DISABLED" } });
    await prisma.session.updateMany({ where: { userId: current.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await audit(req, { action: "UPDATE", recordType: "DRIVER", recordId: current.id, oldValue: current, newValue: updated, reason });
  return res.json(publicDriver(updated));
});
