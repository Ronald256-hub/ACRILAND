export type ManagedHealthState = "ATTENTION" | "CRITICAL";

export type HealthPolicy = {
  criticalAckMinutes: number;
  attentionAckHours: number;
  freshnessHours: number;
  repeatWindowDays: number;
};

export type FaultObservation = {
  vehicleId: string;
  vehicleRegistration: string;
  code: string;
  label: string;
  isCritical: boolean;
  observedAt: Date;
};

export function acknowledgementTargetMinutes(state: ManagedHealthState, policy: HealthPolicy): number {
  return state === "CRITICAL" ? policy.criticalAckMinutes : policy.attentionAckHours * 60;
}

export function acknowledgementDueAt(createdAt: Date, state: ManagedHealthState, policy: HealthPolicy): Date {
  return new Date(createdAt.getTime() + acknowledgementTargetMinutes(state, policy) * 60_000);
}

export function acknowledgementIsOverdue(input: {
  createdAt: Date;
  acknowledgedAt?: Date | null;
  managerStatus: string;
  state: ManagedHealthState;
  policy: HealthPolicy;
  now?: Date;
}): boolean {
  if (input.acknowledgedAt || input.managerStatus !== "OPEN") return false;
  return acknowledgementDueAt(input.createdAt, input.state, input.policy).getTime() < (input.now ?? new Date()).getTime();
}

export function openAgeBand(createdAt: Date, now = new Date()): "UNDER_4_HOURS" | "4_TO_24_HOURS" | "1_TO_3_DAYS" | "OVER_3_DAYS" {
  const hours = Math.max(0, (now.getTime() - createdAt.getTime()) / 3_600_000);
  if (hours < 4) return "UNDER_4_HOURS";
  if (hours < 24) return "4_TO_24_HOURS";
  if (hours < 72) return "1_TO_3_DAYS";
  return "OVER_3_DAYS";
}

export function buildRepeatFaultIntelligence(observations: FaultObservation[]) {
  const systemMap = new Map<string, { code: string; label: string; occurrences: number; criticalOccurrences: number; vehicles: Set<string> }>();
  const vehicleSystemMap = new Map<string, { vehicleId: string; vehicleRegistration: string; code: string; label: string; occurrences: number; criticalOccurrences: number; lastObservedAt: Date }>();

  for (const observation of observations) {
    const system = systemMap.get(observation.code) ?? { code: observation.code, label: observation.label, occurrences: 0, criticalOccurrences: 0, vehicles: new Set<string>() };
    system.occurrences += 1;
    system.criticalOccurrences += observation.isCritical ? 1 : 0;
    system.vehicles.add(observation.vehicleId);
    systemMap.set(observation.code, system);

    const key = `${observation.vehicleId}:${observation.code}`;
    const vehicleSystem = vehicleSystemMap.get(key) ?? {
      vehicleId: observation.vehicleId,
      vehicleRegistration: observation.vehicleRegistration,
      code: observation.code,
      label: observation.label,
      occurrences: 0,
      criticalOccurrences: 0,
      lastObservedAt: observation.observedAt
    };
    vehicleSystem.occurrences += 1;
    vehicleSystem.criticalOccurrences += observation.isCritical ? 1 : 0;
    if (observation.observedAt > vehicleSystem.lastObservedAt) vehicleSystem.lastObservedAt = observation.observedAt;
    vehicleSystemMap.set(key, vehicleSystem);
  }

  const faultSystems = [...systemMap.values()]
    .map((item) => ({ code: item.code, label: item.label, occurrences: item.occurrences, criticalOccurrences: item.criticalOccurrences, vehicleCount: item.vehicles.size }))
    .sort((a, b) => b.occurrences - a.occurrences || b.criticalOccurrences - a.criticalOccurrences || a.label.localeCompare(b.label));

  const repeatVehicleFaults = [...vehicleSystemMap.values()]
    .filter((item) => item.occurrences >= 2)
    .sort((a, b) => b.occurrences - a.occurrences || b.criticalOccurrences - a.criticalOccurrences || b.lastObservedAt.getTime() - a.lastObservedAt.getTime());

  return { faultSystems, repeatVehicleFaults };
}

export function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
