import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { DashboardSummary } from "../types";
import { Icon, type IconName } from "../components/Icon";
import { KpiCard } from "../components/KpiCard";

type AlertItem = { tone: "danger" | "warning" | "info" | "success"; icon: IconName; title: string; detail: string; href: string; tag: string };

const statusLabels: Record<string, string> = {
  AVAILABLE: "Available", RESERVED: "Reserved", ASSIGNED: "Assigned", ON_TRIP: "On trip", PARKED: "Parked",
  SERVICE_DUE: "Service due", SERVICE_OVERDUE: "Service overdue", UNDER_INSPECTION: "Under inspection", UNDER_MAINTENANCE: "Workshop",
  BREAKDOWN: "Breakdown", ACCIDENT: "Accident", GROUNDED: "Grounded", OUT_OF_SERVICE: "Out of service", DISPOSED: "Disposed"
};
const statusTone: Record<string, string> = {
  AVAILABLE: "green", ON_TRIP: "blue", ASSIGNED: "cyan", RESERVED: "violet", PARKED: "slate", SERVICE_DUE: "amber", SERVICE_OVERDUE: "orange",
  UNDER_INSPECTION: "amber", UNDER_MAINTENANCE: "amber", BREAKDOWN: "red", ACCIDENT: "red", GROUNDED: "red", OUT_OF_SERVICE: "red", DISPOSED: "slate"
};

export function DashboardPage() {
  const { me } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void api<DashboardSummary>("/dashboard/summary").then(setData).catch((e) => setError(e instanceof Error ? e.message : "Unable to load fleet health.")); }, []);

  const derived = useMemo(() => {
    if (!data) return null;
    const available = data.vehicleStatus.AVAILABLE ?? 0;
    const grounded = data.vehicleStatus.GROUNDED ?? 0;
    const workshop = (data.vehicleStatus.UNDER_MAINTENANCE ?? 0) + (data.vehicleStatus.BREAKDOWN ?? 0) + (data.vehicleStatus.SERVICE_DUE ?? 0) + (data.vehicleStatus.SERVICE_OVERDUE ?? 0);
    const availability = data.vehicles ? (available / data.vehicles) * 100 : 0;
    const utilization = data.vehicles ? (data.activeTrips / data.vehicles) * 100 : 0;
    const approvalQueue = data.pendingTripApprovals + data.maintenanceAwaitingApproval + data.pendingFuelApprovals + data.pendingProcurement;
    const statusEntries = Object.entries(data.vehicleStatus).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
    const alerts: AlertItem[] = [];
    if (data.criticalOperationalAlerts > 0) alerts.push({ tone: "danger", icon: "bell", title: `${data.criticalOperationalAlerts} critical operational alert${data.criticalOperationalAlerts === 1 ? "" : "s"}`, detail: "Persistent exceptions require acknowledgement or controlled closure.", href: "/operational-alerts", tag: "Escalation" });
    if (data.criticalIncidents > 0) alerts.push({ tone: "danger", icon: "alert", title: `${data.criticalIncidents} critical incident${data.criticalIncidents === 1 ? "" : "s"} open`, detail: "Accident, breakdown or safety investigation requires accountable corrective action.", href: "/incidents", tag: "Incident" });
    if (grounded > 0) alerts.push({ tone: "danger", icon: "alert", title: `${grounded} grounded vehicle${grounded === 1 ? "" : "s"}`, detail: "Dispatch is blocked until an authorized release returns the unit to service.", href: "/vehicles", tag: "Critical" });
    if (data.inspectionFailuresLast30Days > 0) alerts.push({ tone: "danger", icon: "inspection", title: `${data.inspectionFailuresLast30Days} inspection failure${data.inspectionFailuresLast30Days === 1 ? "" : "s"} in 30 days`, detail: "Review failed roadworthiness checks and corrective action before dispatch.", href: "/inspections", tag: "Safety" });
    if (data.openIncidents > 0 && data.criticalIncidents === 0) alerts.push({ tone: "warning", icon: "alert", title: `${data.openIncidents} open fleet incident${data.openIncidents === 1 ? "" : "s"}`, detail: "Investigation and corrective-action records remain open.", href: "/incidents", tag: "Safety" });
    if (data.maintenanceAwaitingApproval > 0) alerts.push({ tone: "warning", icon: "wrench", title: `${data.maintenanceAwaitingApproval} repair approval${data.maintenanceAwaitingApproval === 1 ? "" : "s"} pending`, detail: "Workshop diagnosis is complete and commercial authorization is required before repair proceeds.", href: "/maintenance", tag: "Workshop" });
    if (data.maintenanceReadyForRelease > 0) alerts.push({ tone: "info", icon: "check", title: `${data.maintenanceReadyForRelease} vehicle${data.maintenanceReadyForRelease === 1 ? "" : "s"} ready for release`, detail: "Work is complete; authorized QC release is required before the vehicle becomes available.", href: "/maintenance", tag: "Release" });
    if (data.pendingFuelApprovals > 0) alerts.push({ tone: "info", icon: "gauge", title: `${data.pendingFuelApprovals} fuel request${data.pendingFuelApprovals === 1 ? "" : "s"} awaiting approval`, detail: "Fuel cannot be issued until an independent authorized approver records a decision.", href: "/fuel", tag: "Fuel" });
    if (data.pendingProcurement > 0) alerts.push({ tone: "info", icon: "wrench", title: `${data.pendingProcurement} procurement item${data.pendingProcurement === 1 ? "" : "s"} in pipeline`, detail: "Purchase requests, approvals or ordered workshop stock still require completion.", href: "/inventory", tag: "Stores" });
    if (data.tyresInRepair > 0) alerts.push({ tone: "warning", icon: "vehicle", title: `${data.tyresInRepair} tyre${data.tyresInRepair === 1 ? "" : "s"} in repair`, detail: "Tyre assets remain unavailable for fitment until repair or retirement is recorded.", href: "/tyres", tag: "Tyres" });
    if (data.complianceDueWithin30Days > 0) alerts.push({ tone: "warning", icon: "calendar", title: `${data.complianceDueWithin30Days} vehicle document${data.complianceDueWithin30Days === 1 ? "" : "s"} due or expired`, detail: "Insurance, licensing, fitness or other controlled documents require renewal action within 30 days or are already overdue.", href: "/compliance", tag: "Compliance" });
    if (data.licencesExpiringWithin90Days > 0) alerts.push({ tone: "warning", icon: "calendar", title: `${data.licencesExpiringWithin90Days} driver licence${data.licencesExpiringWithin90Days === 1 ? "" : "s"} expiring within 90 days`, detail: "Renewal action is required to protect driver availability and compliance.", href: "/drivers", tag: "Driver" });
    if (data.pendingTripApprovals > 0) alerts.push({ tone: "info", icon: "trip", title: `${data.pendingTripApprovals} trip request${data.pendingTripApprovals === 1 ? "" : "s"} awaiting approval`, detail: "Movement remains blocked until an independent authorized decision is recorded.", href: "/trips", tag: "Trip" });
    if (!alerts.length) alerts.push({ tone: "success", icon: "check", title: "No critical fleet exceptions", detail: "The live summary has no grounded assets, failed inspections, pending approvals, incidents or active escalations requiring management attention.", href: "/vehicles", tag: "Healthy" });
    return { available, grounded, workshop, availability, utilization, approvalQueue, statusEntries, alerts };
  }, [data]);

  if (error) return <div className="error-box">{error}</div>;
  if (!data || !derived) return <div className="loading-state-v2"><span className="loading-ring" /><b>Building the live operating picture…</b><span>Reading fleet, driver, trip, workshop, fuel, compliance and advanced operations status.</span></div>;
  const firstName = me?.fullName.split(/\s+/)[0] || "Fleet Manager";

  return <>
    <section className="page-hero-v2">
      <div><span className="eyebrow-v2">LIVE OPERATING PICTURE</span><h2>Fleet control is online, {firstName}.</h2><p>Monitor availability, movement, driver readiness, workshop exposure, fuel governance, compliance, incidents, stores and connected-fleet exceptions from one accountable operating view.</p></div>
      <div className="hero-actions-v2">
        {me?.permissions.includes("report.view") && <Link className="button-v2 secondary" to="/reports"><Icon name="audit" size={16} /> Management reports</Link>}
        {me?.permissions.includes("vehicle.create") && <Link className="button-v2 primary" to="/vehicles"><Icon name="plus" size={16} /> Add vehicle</Link>}
      </div>
    </section>

    <div className="command-strip-v2">
      <div className="command-status-v2"><span className="live-pulse" /><div><b>Operations live</b><span>{data.activeTrips} active trip{data.activeTrips === 1 ? "" : "s"} · {data.activeAssignments} active assignment{data.activeAssignments === 1 ? "" : "s"}</span></div></div>
      <div className="command-stat-v2"><span>Fleet availability</span><b>{derived.availability.toFixed(1)}%</b></div>
      <div className="command-stat-v2"><span>Connected vehicles</span><b>{data.telemetryReportingVehicles}</b></div>
      <div className="command-stat-v2"><span>Approval pipeline</span><b>{derived.approvalQueue}</b></div>
    </div>

    <div className="kpi-grid-v2">
      <KpiCard label="Total fleet" value={data.vehicles} detail={`${data.branches} authorized branch${data.branches === 1 ? "" : "es"}`} icon="vehicle" tone="neutral" />
      <KpiCard label="Available now" value={derived.available} detail={`${derived.availability.toFixed(1)}% fleet availability`} icon="check" tone="success" />
      <KpiCard label="On active trips" value={data.activeTrips} detail={`${data.activeAssignments} active assignments`} icon="route" tone="info" />
      <KpiCard label="Workshop control" value={data.activeMaintenance} detail={`${data.maintenanceAwaitingApproval} approval · ${data.maintenanceReadyForRelease} release`} icon="wrench" tone={data.activeMaintenance > 0 ? "warning" : "neutral"} />
      <KpiCard label="Operational alerts" value={data.openOperationalAlerts} detail={`${data.criticalOperationalAlerts} critical escalation${data.criticalOperationalAlerts === 1 ? "" : "s"}`} icon="bell" tone={data.criticalOperationalAlerts > 0 ? "danger" : data.openOperationalAlerts > 0 ? "warning" : "success"} />
      <KpiCard label="Open incidents" value={data.openIncidents} detail={`${data.criticalIncidents} critical`} icon="alert" tone={data.criticalIncidents > 0 ? "danger" : data.openIncidents > 0 ? "warning" : "success"} />
      <KpiCard label="Driver readiness" value={data.activeDrivers} detail={`${data.drivers} registered driver records`} icon="driver" tone="neutral" />
      <KpiCard label="Fuel approvals" value={data.pendingFuelApprovals} detail={`30-day spend UGX ${data.fuelSpendLast30Days.toLocaleString()}`} icon="gauge" tone={data.pendingFuelApprovals > 0 ? "warning" : "success"} />
      <KpiCard label="Compliance watch" value={data.complianceDueWithin30Days} detail="Vehicle documents due / expired within 30 days" icon="calendar" tone={data.complianceDueWithin30Days > 0 ? "warning" : "success"} />
      <KpiCard label="Tyres in repair" value={data.tyresInRepair} detail="Unavailable tyre assets" icon="vehicle" tone={data.tyresInRepair > 0 ? "warning" : "success"} />
      <KpiCard label="Procurement pipeline" value={data.pendingProcurement} detail="Requested, approved or ordered" icon="wrench" tone={data.pendingProcurement > 0 ? "info" : "success"} />
      <KpiCard label="Telemetry coverage" value={data.telemetryReportingVehicles} detail={`${data.vehicles ? ((data.telemetryReportingVehicles / data.vehicles) * 100).toFixed(0) : 0}% of registered fleet`} icon="route" tone="info" />
    </div>

    <div className="dashboard-grid-v2">
      <section className="panel-v2 span-7">
        <div className="panel-head-v2"><div><span className="panel-kicker">FLEET HEALTH</span><h3>Availability by operating state</h3><p>Live distribution across the registered fleet.</p></div><Link to="/vehicles">Open fleet register <Icon name="arrow" size={14} /></Link></div>
        <div className="panel-body-v2">
          {derived.statusEntries.length ? <div className="status-stack-v2">{derived.statusEntries.map(([status, value]) => {const pct = data.vehicles ? (value / data.vehicles) * 100 : 0;return <div className="status-row-v2" key={status}><div className="status-label-v2"><span className={`status-dot-v2 ${statusTone[status] ?? "slate"}`} /><span>{statusLabels[status] ?? status.replaceAll("_", " ")}</span></div><div className="status-track-v2"><i className={statusTone[status] ?? "slate"} style={{ width: `${Math.max(2, pct)}%` }} /></div><b>{value}</b><small>{pct.toFixed(1)}%</small></div>;})}</div> : <div className="empty-state-v2"><Icon name="vehicle" size={26} /><b>No vehicle records yet</b><span>Add the fleet register to begin operational monitoring.</span></div>}
          <div className="health-summary-v2"><div><span>Available</span><b>{derived.availability.toFixed(1)}%</b><small>Ready for controlled allocation</small></div><div><span>Utilized</span><b>{derived.utilization.toFixed(1)}%</b><small>Vehicles on active trips</small></div><div><span>Workshop exposure</span><b>{data.vehicles ? ((derived.workshop / data.vehicles) * 100).toFixed(1) : "0.0"}%</b><small>Maintenance and service states</small></div></div>
        </div>
      </section>

      <section className="panel-v2 span-5">
        <div className="panel-head-v2"><div><span className="panel-kicker">MANAGEMENT ATTENTION</span><h3>Priority control queue</h3><p>Exceptions requiring accountable action.</p></div></div>
        <div className="panel-body-v2 alert-list-v2">{derived.alerts.slice(0,7).map((alert, index) => <Link className={`alert-item-v2 ${alert.tone}`} to={alert.href} key={`${alert.title}-${index}`}><span className="alert-icon-v2"><Icon name={alert.icon} size={17} /></span><div><b>{alert.title}</b><p>{alert.detail}</p></div><span className="alert-tag-v2">{alert.tag}</span></Link>)}</div>
      </section>

      <section className="panel-v2 span-8">
        <div className="panel-head-v2"><div><span className="panel-kicker">CONTROLLED OPERATIONS</span><h3>Authorization & fleet-health workflow</h3><p>Movement, workshop, fuel, procurement and exception actions remain permission-gated and auditable.</p></div></div>
        <div className="panel-body-v2 workflow-grid-v2">
          <Link to="/trips"><span className="workflow-icon"><Icon name="trip" /></span><div><span>Trip approvals</span><b>{data.pendingTripApprovals}</b><small>Awaiting fleet decision</small></div></Link>
          <Link to="/maintenance"><span className="workflow-icon"><Icon name="wrench" /></span><div><span>Workshop approvals</span><b>{data.maintenanceAwaitingApproval}</b><small>Diagnosed, awaiting authority</small></div></Link>
          <Link to="/inventory"><span className="workflow-icon"><Icon name="audit" /></span><div><span>Procurement pipeline</span><b>{data.pendingProcurement}</b><small>Request to goods receipt</small></div></Link>
          <Link to="/operational-alerts"><span className="workflow-icon"><Icon name="bell" /></span><div><span>Operational alerts</span><b>{data.openOperationalAlerts}</b><small>Persistent escalation queue</small></div></Link>
        </div>
      </section>

      <section className="panel-v2 span-4">
        <div className="panel-head-v2"><div><span className="panel-kicker">CONNECTED & HUMAN READINESS</span><h3>Coverage watch</h3><p>Driver readiness and connected-fleet reporting.</p></div></div>
        <div className="panel-body-v2 readiness-v2">
          <div className="readiness-ring" style={{ "--value": `${data.drivers ? Math.min(100, (data.activeDrivers / data.drivers) * 100) : 0}%` } as React.CSSProperties}><div><b>{data.drivers ? ((data.activeDrivers / data.drivers) * 100).toFixed(0) : 0}%</b><span>drivers active</span></div></div>
          <div className="readiness-copy-v2"><div><span>Active drivers</span><b>{data.activeDrivers}</b></div><div><span>Telemetry vehicles</span><b>{data.telemetryReportingVehicles}</b></div><div className={data.licencesExpiringWithin90Days > 0 ? "attention" : ""}><span>Licence watch</span><b>{data.licencesExpiringWithin90Days}</b></div></div>
        </div>
      </section>
    </div>
  </>;
}
