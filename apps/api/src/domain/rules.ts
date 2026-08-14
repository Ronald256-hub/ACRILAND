export class BusinessRuleError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; this.name = "BusinessRuleError"; }
}

export type VehicleStatus =
  | "AVAILABLE" | "RESERVED" | "ASSIGNED" | "ON_TRIP" | "PARKED" | "SERVICE_DUE"
  | "SERVICE_OVERDUE" | "UNDER_INSPECTION" | "UNDER_MAINTENANCE" | "BREAKDOWN"
  | "ACCIDENT" | "GROUNDED" | "OUT_OF_SERVICE" | "DISPOSED";

export const BLOCKED_FROM_OPERATION = new Set<VehicleStatus>([
  "UNDER_MAINTENANCE", "BREAKDOWN", "ACCIDENT", "GROUNDED", "OUT_OF_SERVICE", "DISPOSED", "SERVICE_OVERDUE"
]);

export const VEHICLE_TRANSITIONS: Record<VehicleStatus, readonly VehicleStatus[]> = {
  AVAILABLE: ["RESERVED","ASSIGNED","PARKED","SERVICE_DUE","UNDER_INSPECTION","UNDER_MAINTENANCE","BREAKDOWN","ACCIDENT","GROUNDED","OUT_OF_SERVICE"],
  RESERVED: ["AVAILABLE","ASSIGNED","UNDER_INSPECTION","GROUNDED"],
  ASSIGNED: ["AVAILABLE","ON_TRIP","PARKED","SERVICE_DUE","BREAKDOWN","ACCIDENT","GROUNDED"],
  ON_TRIP: ["ASSIGNED","PARKED","SERVICE_DUE","BREAKDOWN","ACCIDENT","GROUNDED"],
  PARKED: ["AVAILABLE","ASSIGNED","SERVICE_DUE","UNDER_INSPECTION","UNDER_MAINTENANCE","GROUNDED"],
  SERVICE_DUE: ["AVAILABLE","ASSIGNED","UNDER_MAINTENANCE","SERVICE_OVERDUE","GROUNDED"],
  SERVICE_OVERDUE: ["UNDER_MAINTENANCE","GROUNDED","OUT_OF_SERVICE"],
  UNDER_INSPECTION: ["AVAILABLE","UNDER_MAINTENANCE","GROUNDED","OUT_OF_SERVICE"],
  UNDER_MAINTENANCE: ["UNDER_INSPECTION","AVAILABLE","GROUNDED","OUT_OF_SERVICE"],
  BREAKDOWN: ["UNDER_MAINTENANCE","GROUNDED","OUT_OF_SERVICE"],
  ACCIDENT: ["UNDER_MAINTENANCE","GROUNDED","OUT_OF_SERVICE"],
  GROUNDED: ["UNDER_INSPECTION","UNDER_MAINTENANCE","AVAILABLE","OUT_OF_SERVICE"],
  OUT_OF_SERVICE: ["UNDER_INSPECTION","AVAILABLE","DISPOSED"],
  DISPOSED: []
};

export function canTransitionVehicle(from: VehicleStatus, to: VehicleStatus): boolean {
  return from === to || VEHICLE_TRANSITIONS[from].includes(to);
}

export function validateOdometer(initialKm: number, currentKm: number): void {
  if (!Number.isInteger(initialKm) || !Number.isInteger(currentKm) || initialKm < 0 || currentKm < initialKm) {
    throw new BusinessRuleError("Current odometer cannot be lower than the initial odometer.");
  }
}

export function effectiveDriverStatus(status: string, licenceExpiry: Date, now = new Date()): string {
  if (licenceExpiry.getTime() < now.getTime() && status !== "INACTIVE" && status !== "SUSPENDED") return "LICENCE_EXPIRED";
  return status;
}

export function canDriverOperate(status: string, licenceExpiry: Date, now = new Date()): boolean {
  return effectiveDriverStatus(status, licenceExpiry, now) === "ACTIVE";
}
