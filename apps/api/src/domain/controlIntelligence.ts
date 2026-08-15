import { BusinessRuleError } from "./rules.js";

export type GeoPoint = { latitude: number; longitude: number };
export type GeofenceShapeInput =
  | { shape: "CIRCLE"; centerLatitude: number; centerLongitude: number; radiusMetres: number; polygon?: never }
  | { shape: "POLYGON"; polygon: readonly GeoPoint[]; centerLatitude?: never; centerLongitude?: never; radiusMetres?: never };

const earthRadiusMetres = 6_371_000;
const rad = (degrees: number) => degrees * Math.PI / 180;

export function haversineMetres(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMetres * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pointInPolygon(point: GeoPoint, polygon: readonly GeoPoint[]): boolean {
  if (polygon.length < 3) throw new BusinessRuleError("A polygon geofence requires at least three points.");
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.longitude, yi = polygon[i]!.latitude;
    const xj = polygon[j]!.longitude, yj = polygon[j]!.latitude;
    const intersects = ((yi > point.latitude) !== (yj > point.latitude)) &&
      point.longitude < (xj - xi) * (point.latitude - yi) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInGeofence(point: GeoPoint, geofence: GeofenceShapeInput): boolean {
  if (geofence.shape === "CIRCLE") {
    if (geofence.radiusMetres <= 0) throw new BusinessRuleError("Geofence radius must be greater than zero.");
    return haversineMetres(point, { latitude: geofence.centerLatitude, longitude: geofence.centerLongitude }) <= geofence.radiusMetres;
  }
  return pointInPolygon(point, geofence.polygon);
}

export function validateDispatchWindow(plannedDeparture: Date, plannedReturn: Date): void {
  if (plannedReturn.getTime() < plannedDeparture.getTime()) throw new BusinessRuleError("Planned return cannot be before planned departure.");
}

export function overlapsWindow(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export type DriverScoreInput = {
  safetyEventPoints: number;
  incidentPoints: number;
  inspectionPoints: number;
};

export function calculateDriverScore(input: DriverScoreInput): { score: number; riskBand: "EXCELLENT" | "GOOD" | "WATCH" | "HIGH_RISK" } {
  const penalty = Math.max(0, input.safetyEventPoints) + Math.max(0, input.incidentPoints) + Math.max(0, input.inspectionPoints);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const riskBand = score >= 90 ? "EXCELLENT" : score >= 80 ? "GOOD" : score >= 70 ? "WATCH" : "HIGH_RISK";
  return { score, riskBand };
}

export function incidentPenalty(severity: string): number {
  if (severity === "CRITICAL") return 30;
  if (severity === "HIGH") return 15;
  if (severity === "MEDIUM") return 5;
  return 2;
}

export function speedPenalty(speedKph: number, limitKph: number): number {
  if (speedKph <= limitKph) return 0;
  const excess = speedKph - limitKph;
  if (excess >= 30) return 15;
  if (excess >= 20) return 10;
  if (excess >= 10) return 5;
  return 2;
}
