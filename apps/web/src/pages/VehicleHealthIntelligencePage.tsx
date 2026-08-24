import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/Icon";

type HealthPolicy = {
  healthCriticalAckMinutes: number;
  healthAttentionAckHours: number;
  healthFreshnessHours: number;
  healthRepeatWindowDays: number;
};
type HealthQueueRow = {
  id: string;
  healthState: "ATTENTION" | "CRITICAL";
  managerStatus: string;
  createdAt: string;
  dueAt: string;
  responseOverdue: boolean;
  ageMinutes: number;
  vehicleId: string;
  registrationNumber: string;
  vehicle: string;
  vehicleStatus: string;
  driverName?: string | null;
  employeeNumber?: string | null;
  odometerKm: number;
  loadState?: string | null;
  repairRequest?: string | null;
  vehicleBehavior?: string | null;
  workOrderId?: string | null;
  evidenceCount: number;
};
type StaleAssignment = {
  vehicleId: string;
  registrationNumber: string;
  vehicle: string;
  vehicleStatus: string;
  healthState: string;
  healthUpdatedAt?: string | null;
  driverId: string;
  driverName: string;
  employeeNumber: string;
};
type FaultSystem = { code: string; label: string; occurrences: number; criticalOccurrences: number; vehicleCount: number };
type RepeatVehicleFault = { vehicleId: string; vehicleRegistration: string; code: string; label: string; occurrences: number; criticalOccurrences: number; lastObservedAt: string };
type HealthSummary = {
  generatedAt: string;
  policy: HealthPolicy;
  fleetHealth: { healthy: number; attention: number; critical: number; unknown: number; total: number };
  reportingCompliance: { activeAssignedVehicles: number; freshDailyChecks: number; staleOrMissingChecks: number; compliancePercent: number; staleAssignments: StaleAssignment[] };
  responseControl: {
    openReports: number;
    openCritical: number;
    openAttention: number;
    overdueResponses: number;
    overdueCriticalResponses: number;
    ageBuckets: { UNDER_4_HOURS: number; "4_TO_24_HOURS": number; "1_TO_3_DAYS": number; OVER_3_DAYS: number };
    queue: HealthQueueRow[];
  };
  repeatFaults: { windowDays: number; faultSystems: FaultSystem[]; repeatVehicleFaults: RepeatVehicleFault[] };
  followThrough: { managedReportsInWindow: number; acknowledgedReports: number; resolvedReports: number; workOrderReports: number; workOrderConversionPercent: number; averageAcknowledgementMinutes: number | null; averageResolutionHours: number | null };
};

function duration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h${mins ? ` ${mins}m` : ""}`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d${remainingHours ? ` ${remainingHours}h` : ""}`;
}
function healthTone(state: string) { return state === "CRITICAL" ? "danger" : state === "ATTENTION" ? "warning" : state === "HEALTHY" ? "good" : "info"; }

export function VehicleHealthIntelligencePage() {
  const { me } = useAuth();
  const [data, setData] = useState<HealthSummary | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const canManagePolicy = me?.permissions.includes("settings.manage") ?? false;

  const load = async () => {
    setError("");
    try { setData(await api<HealthSummary>("/health-intelligence/summary")); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load vehicle health intelligence."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const responseQueue = useMemo(() => data?.responseControl.queue.slice().sort((a, b) => Number(b.responseOverdue) - Number(a.responseOverdue) || (a.healthState === "CRITICAL" ? -1 : 1) || a.createdAt.localeCompare(b.createdAt)) ?? [], [data]);
  const policySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      healthCriticalAckMinutes: Number(form.get("healthCriticalAckMinutes")),
      healthAttentionAckHours: Number(form.get("healthAttentionAckHours")),
      healthFreshnessHours: Number(form.get("healthFreshnessHours")),
      healthRepeatWindowDays: Number(form.get("healthRepeatWindowDays"))
    };
    setSavingPolicy(true); setError(""); setNotice("");
    try {
      await api("/health-intelligence/policy", { method: "PATCH", body: JSON.stringify(payload) });
      await load(); setEditingPolicy(false); setNotice("Vehicle health response policy updated and audit logged.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update vehicle health policy."); }
    finally { setSavingPolicy(false); }
  };

  if (loading) return <div className="loading-state-v2"><span className="loading-ring"/><b>Building vehicle health intelligence…</b><span>Reading driver checks, repair follow-up, assignment coverage and repeat-fault history.</span></div>;
  if (!data) return <div className="error-box">{error || "Vehicle health intelligence is unavailable."}</div>;
  const f = data.fleetHealth;
  const r = data.responseControl;
  const complianceTone = data.reportingCompliance.compliancePercent >= 95 ? "good" : data.reportingCompliance.compliancePercent >= 80 ? "warning" : "danger";

  return <>
    <section className="page-hero-v2 health-intel-hero-v11">
      <div><span className="eyebrow-v2">VEHICLE HEALTH · DRIVER EVIDENCE · MANAGEMENT ACCOUNTABILITY</span><h2>Vehicle Health Intelligence</h2><p>Turn daily driver observations into a live fleet-health picture: current condition, missing checks, overdue management response, repair follow-through and recurring mechanical patterns.</p></div>
      <div className="hero-actions-v2"><button className="button-v2 secondary" onClick={() => void load()}><Icon name="clock" size={16}/>Refresh picture</button><Link className="button-v2 primary" to="/inspections"><Icon name="inspection" size={16}/>Open health checks</Link></div>
    </section>
    {error && <div className="error-box">{error}</div>}{notice && <div className="success-box-v6">{notice}</div>}

    <div className="health-intel-kpis-v11">
      <div className={f.critical ? "danger" : "good"}><span>Critical vehicle health</span><b>{f.critical}</b><small>Driver-reported critical condition</small></div>
      <div className={f.attention ? "warning" : "good"}><span>Repair attention</span><b>{f.attention}</b><small>Open non-critical condition</small></div>
      <div className="good"><span>Driver-confirmed healthy</span><b>{f.healthy}</b><small>{f.total ? ((f.healthy / f.total) * 100).toFixed(1) : "0.0"}% of registered fleet</small></div>
      <div className={complianceTone}><span>Fresh daily checks</span><b>{data.reportingCompliance.compliancePercent.toFixed(1)}%</b><small>{data.reportingCompliance.freshDailyChecks}/{data.reportingCompliance.activeAssignedVehicles} assigned vehicles</small></div>
      <div className={r.overdueCriticalResponses ? "danger" : r.overdueResponses ? "warning" : "good"}><span>Overdue responses</span><b>{r.overdueResponses}</b><small>{r.overdueCriticalResponses} critical overdue</small></div>
      <div className={r.openReports ? "info" : "good"}><span>Open health reports</span><b>{r.openReports}</b><small>{r.openCritical} critical · {r.openAttention} attention</small></div>
    </div>

    <section className="health-policy-v11">
      <div className="health-policy-head-v11"><div><span className="panel-kicker">RESPONSE POLICY</span><h3>What “on time” means for ACRILAND</h3><p>Targets are organization controls, not hidden application constants.</p></div>{canManagePolicy && <button className="button-v2 secondary" onClick={() => setEditingPolicy((value) => !value)}><Icon name={editingPolicy ? "close" : "shield"} size={15}/>{editingPolicy ? "Cancel" : "Edit policy"}</button>}</div>
      <div className="health-policy-grid-v11"><div><span>Critical acknowledgement</span><b>{data.policy.healthCriticalAckMinutes} min</b><small>Red driver-health report ownership target</small></div><div><span>Attention acknowledgement</span><b>{data.policy.healthAttentionAckHours} h</b><small>Orange repair-attention ownership target</small></div><div><span>Health freshness</span><b>{data.policy.healthFreshnessHours} h</b><small>Assigned vehicle daily-check freshness window</small></div><div><span>Repeat-fault window</span><b>{data.policy.healthRepeatWindowDays} days</b><small>Lookback used for recurring defect intelligence</small></div></div>
      {editingPolicy && canManagePolicy && <form className="health-policy-form-v11" onSubmit={policySubmit}><label>Critical acknowledgement (minutes)<input type="number" name="healthCriticalAckMinutes" min={5} max={1440} defaultValue={data.policy.healthCriticalAckMinutes} required/></label><label>Attention acknowledgement (hours)<input type="number" name="healthAttentionAckHours" min={1} max={168} defaultValue={data.policy.healthAttentionAckHours} required/></label><label>Freshness window (hours)<input type="number" name="healthFreshnessHours" min={4} max={168} defaultValue={data.policy.healthFreshnessHours} required/></label><label>Repeat-fault window (days)<input type="number" name="healthRepeatWindowDays" min={7} max={365} defaultValue={data.policy.healthRepeatWindowDays} required/></label><button className="button-v2 primary" disabled={savingPolicy}>{savingPolicy ? "Saving…" : "Save audited policy"}</button></form>}
    </section>

    <div className="health-intel-layout-v11">
      <section className="panel-v2 health-response-queue-v11"><div className="panel-head-v2"><div><span className="panel-kicker">MANAGEMENT RESPONSE CONTROL</span><h3>Open driver-health queue</h3><p>Prioritized by overdue response and critical condition.</p></div><Link to="/inspections">Manage checks <Icon name="arrow" size={13}/></Link></div><div className="health-queue-v11">{responseQueue.map((row) => <article className={`health-queue-row-v11 ${row.healthState.toLowerCase()} ${row.responseOverdue ? "overdue" : ""}`} key={row.id}><div className="health-queue-state-v11"><span className={`health-state-v11 ${row.healthState.toLowerCase()}`}>{row.healthState}</span>{row.responseOverdue && <span className="response-overdue-v11"><Icon name="clock" size={13}/>RESPONSE OVERDUE</span>}</div><div className="health-queue-main-v11"><div><Link to={`/vehicles/${row.vehicleId}`}>{row.registrationNumber}</Link><span>{row.vehicle}</span></div><p>{row.repairRequest || row.vehicleBehavior || "Checklist condition requires management follow-up."}</p><div className="health-queue-facts-v11"><span>Driver <b>{row.driverName || "—"}</b></span><span>Odometer <b>{row.odometerKm.toLocaleString()} km</b></span><span>Load <b>{row.loadState?.replaceAll("_", " ") || "Not stated"}</b></span><span>Photos <b>{row.evidenceCount}</b></span></div></div><div className="health-queue-control-v11"><span>{row.managerStatus.replaceAll("_", " ")}</span><b>{duration(row.ageMinutes)} open</b><small>Target {new Date(row.dueAt).toLocaleString()}</small>{row.workOrderId && <em>WORK ORDER LINKED</em>}<Link className="mini-action-v2" to="/inspections">Review report</Link></div></article>)}{!responseQueue.length && <div className="empty-state-v2"><Icon name="check" size={26}/><b>No unresolved driver-health reports</b><span>Current reported vehicle conditions have no open management follow-up.</span></div>}</div></section>

      <section className="panel-v2 health-age-panel-v11"><div className="panel-head-v2"><div><span className="panel-kicker">AGEING PROFILE</span><h3>How long defects stay open</h3></div></div><div className="health-age-grid-v11"><div><span>&lt; 4 hours</span><b>{r.ageBuckets.UNDER_4_HOURS}</b></div><div><span>4–24 hours</span><b>{r.ageBuckets["4_TO_24_HOURS"]}</b></div><div><span>1–3 days</span><b>{r.ageBuckets["1_TO_3_DAYS"]}</b></div><div className={r.ageBuckets.OVER_3_DAYS ? "danger" : ""}><span>&gt; 3 days</span><b>{r.ageBuckets.OVER_3_DAYS}</b></div></div><div className="health-follow-v11"><div><span>Avg acknowledgement</span><b>{data.followThrough.averageAcknowledgementMinutes === null ? "—" : duration(Math.round(data.followThrough.averageAcknowledgementMinutes))}</b></div><div><span>Avg resolution</span><b>{data.followThrough.averageResolutionHours === null ? "—" : `${data.followThrough.averageResolutionHours.toFixed(1)} h`}</b></div><div><span>Workshop conversion</span><b>{data.followThrough.workOrderConversionPercent.toFixed(1)}%</b></div><div><span>Resolved in window</span><b>{data.followThrough.resolvedReports}/{data.followThrough.managedReportsInWindow}</b></div></div></section>
    </div>

    <div className="health-intel-layout-v11 second-v11">
      <section className="panel-v2"><div className="panel-head-v2"><div><span className="panel-kicker">DAILY REPORTING DISCIPLINE</span><h3>Assigned vehicles missing a fresh health check</h3><p>Fresh means a DAILY Vehicle Health Check inside the configured {data.policy.healthFreshnessHours}-hour window.</p></div></div><div className="stale-health-list-v11">{data.reportingCompliance.staleAssignments.map((row) => <Link to={`/vehicles/${row.vehicleId}`} key={row.vehicleId}><span className={`health-dot-v11 ${healthTone(row.healthState)}`}/><div><b>{row.registrationNumber}</b><small>{row.vehicle} · {row.driverName} ({row.employeeNumber})</small></div><span>{row.healthUpdatedAt ? `Last health ${new Date(row.healthUpdatedAt).toLocaleString()}` : "No health confirmation yet"}</span><Icon name="arrow" size={14}/></Link>)}{!data.reportingCompliance.staleAssignments.length && <div className="empty-state-v2"><Icon name="check" size={24}/><b>Assigned-vehicle health coverage is current</b><span>Every active assignment has a DAILY health report inside the configured freshness window.</span></div>}</div></section>

      <section className="panel-v2"><div className="panel-head-v2"><div><span className="panel-kicker">REPEAT DEFECT INTELLIGENCE</span><h3>Most frequently reported systems</h3><p>{data.repeatFaults.windowDays}-day driver evidence lookback.</p></div></div><div className="fault-hotspots-v11">{data.repeatFaults.faultSystems.map((row, index) => <div key={row.code}><span className="fault-rank-v11">{index + 1}</span><div><b>{row.label}</b><small>{row.vehicleCount} vehicle{row.vehicleCount === 1 ? "" : "s"} affected · {row.criticalOccurrences} critical observation{row.criticalOccurrences === 1 ? "" : "s"}</small></div><strong>{row.occurrences}</strong></div>)}{!data.repeatFaults.faultSystems.length && <div className="empty-state-v2"><Icon name="check" size={24}/><b>No repeat-fault pattern yet</b><span>Driver defect history has not produced a recurring system hotspot in the current window.</span></div>}</div></section>
    </div>

    <section className="panel-v2"><div className="panel-head-v2"><div><span className="panel-kicker">RECURRING VEHICLE PROBLEMS</span><h3>Same system reported repeatedly on the same truck</h3><p>These are candidates for deeper diagnosis, root-cause work or preventive intervention—not just repeated symptom repair.</p></div></div><div className="repeat-vehicle-grid-v11">{data.repeatFaults.repeatVehicleFaults.map((row) => <Link to={`/vehicles/${row.vehicleId}`} key={`${row.vehicleId}-${row.code}`}><div><span className={row.criticalOccurrences ? "repeat-critical-v11" : "repeat-attention-v11"}>{row.criticalOccurrences ? "CRITICAL HISTORY" : "REPEAT ATTENTION"}</span><h4>{row.vehicleRegistration}</h4><p>{row.label}</p></div><div><b>{row.occurrences}×</b><small>Last {new Date(row.lastObservedAt).toLocaleDateString()}</small></div></Link>)}{!data.repeatFaults.repeatVehicleFaults.length && <div className="empty-state-v2"><Icon name="check" size={24}/><b>No repeated same-system vehicle faults</b><span>There is no vehicle/system pair with two or more defect observations in the configured lookback window.</span></div>}</div></section>

    <div className="manager-control-note-v2"><Icon name="shield"/><div><b>Condition severity and management performance stay separate</b><span>A truck can be CRITICAL because of its mechanical condition; a response can be OVERDUE because management has not acknowledged it within policy. The system tracks both so operational risk is not hidden by workflow status.</span></div></div>
  </>;
}
