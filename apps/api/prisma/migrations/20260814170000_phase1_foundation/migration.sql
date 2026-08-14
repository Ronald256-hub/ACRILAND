-- ACRILAND Fleet Command Centre - Phase 1 foundation
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE','DISABLED','LOCKED','INVITED');
CREATE TYPE "DriverStatus" AS ENUM ('ACTIVE','OFF_DUTY','LEAVE','SUSPENDED','LICENCE_EXPIRED','INACTIVE');
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE','RESERVED','ASSIGNED','ON_TRIP','PARKED','SERVICE_DUE','SERVICE_OVERDUE','UNDER_INSPECTION','UNDER_MAINTENANCE','BREAKDOWN','ACCIDENT','GROUNDED','OUT_OF_SERVICE','DISPOSED');
CREATE TYPE "FuelType" AS ENUM ('DIESEL','PETROL','ELECTRIC','HYBRID','LPG','CNG','OTHER');
CREATE TYPE "TransmissionType" AS ENUM ('MANUAL','AUTOMATIC','AMT','CVT','OTHER');

CREATE TABLE "Organization" (
  "id" UUID PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Kampala',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

CREATE TABLE "Branch" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Branch_organizationId_code_key" ON "Branch"("organizationId","code");
CREATE INDEX "Branch_organizationId_isActive_idx" ON "Branch"("organizationId","isActive");

CREATE TABLE "Department" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "branchId" UUID,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "costCentre" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Department_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Department_organizationId_code_key" ON "Department"("organizationId","code");
CREATE INDEX "Department_organizationId_branchId_idx" ON "Department"("organizationId","branchId");

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "branchId" UUID,
  "departmentId" UUID,
  "email" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "phone" TEXT,
  "passwordHash" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT TRUE,
  "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId","email");
CREATE INDEX "User_organizationId_status_idx" ON "User"("organizationId","status");

CREATE TABLE "Role" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId","name");

CREATE TABLE "Permission" (
  "id" UUID PRIMARY KEY,
  "key" TEXT NOT NULL,
  "description" TEXT NOT NULL
);
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

CREATE TABLE "RolePermission" (
  "roleId" UUID NOT NULL,
  "permissionId" UUID NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId"),
  CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UserRole" (
  "userId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId"),
  CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Session" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId","expiresAt");

CREATE TABLE "PasswordResetToken" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId","expiresAt");

CREATE TABLE "LoginEvent" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID,
  "userId" UUID,
  "email" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "reason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "LoginEvent_organizationId_createdAt_idx" ON "LoginEvent"("organizationId","createdAt");
CREATE INDEX "LoginEvent_email_createdAt_idx" ON "LoginEvent"("email","createdAt");

CREATE TABLE "Driver" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "branchId" UUID,
  "departmentId" UUID,
  "userId" UUID,
  "employeeNumber" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "nationalIdRef" TEXT,
  "licenceNumber" TEXT NOT NULL,
  "licenceClass" TEXT NOT NULL,
  "licenceIssueDate" TIMESTAMP(3),
  "licenceExpiry" TIMESTAMP(3) NOT NULL,
  "emergencyContact" TEXT,
  "status" "DriverStatus" NOT NULL DEFAULT 'ACTIVE',
  "photoUrl" TEXT,
  "notes" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Driver_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Driver_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Driver_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");
CREATE UNIQUE INDEX "Driver_organizationId_employeeNumber_key" ON "Driver"("organizationId","employeeNumber");
CREATE UNIQUE INDEX "Driver_organizationId_licenceNumber_key" ON "Driver"("organizationId","licenceNumber");
CREATE INDEX "Driver_organizationId_status_idx" ON "Driver"("organizationId","status");
CREATE INDEX "Driver_organizationId_licenceExpiry_idx" ON "Driver"("organizationId","licenceExpiry");

CREATE TABLE "DriverLicence" (
  "id" UUID PRIMARY KEY,
  "driverId" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "class" TEXT NOT NULL,
  "issueDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "documentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverLicence_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DriverLicence_driverId_expiryDate_idx" ON "DriverLicence"("driverId","expiryDate");

CREATE TABLE "Vehicle" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "branchId" UUID,
  "departmentId" UUID,
  "registrationNumber" TEXT NOT NULL,
  "fleetNumber" TEXT,
  "vin" TEXT NOT NULL,
  "engineNumber" TEXT,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "variant" TEXT,
  "category" TEXT NOT NULL,
  "bodyType" TEXT,
  "manufacturingYear" INTEGER NOT NULL,
  "registrationYear" INTEGER,
  "fuelType" "FuelType" NOT NULL,
  "transmission" "TransmissionType",
  "engineCapacityCc" INTEGER,
  "tankCapacityLitres" DECIMAL(10,2),
  "grossWeightKg" DECIMAL(12,2),
  "colour" TEXT,
  "costCentre" TEXT,
  "acquisitionMethod" TEXT,
  "ownershipType" TEXT,
  "purchaseDate" TIMESTAMP(3),
  "purchasePrice" DECIMAL(18,2),
  "supplier" TEXT,
  "warrantyStart" TIMESTAMP(3),
  "warrantyEnd" TIMESTAMP(3),
  "warrantyMileageKm" INTEGER,
  "initialOdometerKm" INTEGER NOT NULL DEFAULT 0,
  "currentOdometerKm" INTEGER NOT NULL DEFAULT 0,
  "currentLocation" TEXT,
  "imageUrl" TEXT,
  "notes" TEXT,
  "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Vehicle_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Vehicle_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Vehicle_odometer_check" CHECK ("initialOdometerKm" >= 0 AND "currentOdometerKm" >= "initialOdometerKm")
);
CREATE UNIQUE INDEX "Vehicle_organizationId_registrationNumber_key" ON "Vehicle"("organizationId","registrationNumber");
CREATE UNIQUE INDEX "Vehicle_organizationId_vin_key" ON "Vehicle"("organizationId","vin");
CREATE INDEX "Vehicle_organizationId_status_idx" ON "Vehicle"("organizationId","status");
CREATE INDEX "Vehicle_organizationId_branchId_idx" ON "Vehicle"("organizationId","branchId");
CREATE INDEX "Vehicle_organizationId_currentOdometerKm_idx" ON "Vehicle"("organizationId","currentOdometerKm");

CREATE TABLE "AuditLog" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "userId" UUID,
  "action" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "reason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId","createdAt");
CREATE INDEX "AuditLog_organizationId_recordType_recordId_idx" ON "AuditLog"("organizationId","recordType","recordId");
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId","createdAt");
