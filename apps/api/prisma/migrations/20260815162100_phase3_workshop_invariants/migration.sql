-- A vehicle can only be controlled by one active workshop lifecycle at a time.
CREATE UNIQUE INDEX "MaintenanceWorkOrder_active_vehicle_key"
ON "MaintenanceWorkOrder"("vehicleId")
WHERE "status" IN ('OPEN','DIAGNOSIS','AWAITING_APPROVAL','APPROVED','IN_PROGRESS','QC','READY_FOR_RELEASE');
