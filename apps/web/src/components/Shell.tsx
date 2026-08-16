import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Icon, type IconName } from "./Icon";
import { SearchPalette } from "./SearchPalette";

type ManagementLink = { to: string; label: string; icon: IconName; permission: string };
type DriverLink = { to: string; label: string; icon: IconName };

const managementGroups: { label: string; links: ManagementLink[] }[] = [
  { label: "Operations", links: [
    { to: "/", label: "Command Centre", icon: "command", permission: "dashboard.view" },
    { to: "/action-centre", label: "Action Centre", icon: "bell", permission: "dashboard.view" },
    { to: "/vehicles", label: "Vehicles", icon: "vehicle", permission: "vehicle.view" },
    { to: "/drivers", label: "Drivers", icon: "driver", permission: "driver.view" },
    { to: "/assignments", label: "Assignments", icon: "assignment", permission: "assignment.view" },
    { to: "/trips", label: "Trip Control", icon: "trip", permission: "trip.view" },
    { to: "/dispatch", label: "Dispatch Control", icon: "route", permission: "dispatch.view" },
    { to: "/inspections", label: "Inspections", icon: "inspection", permission: "inspection.view" }
  ]},
  { label: "Fleet health", links: [
    { to: "/maintenance", label: "Maintenance", icon: "wrench", permission: "maintenance.view" },
    { to: "/fuel", label: "Fuel Control", icon: "gauge", permission: "fuel.view" },
    { to: "/compliance", label: "Alerts & Compliance", icon: "alert", permission: "compliance.view" },
    { to: "/reports", label: "Reports", icon: "audit", permission: "report.view" }
  ]},
  { label: "Advanced operations", links: [
    { to: "/tyres", label: "Tyres & Fitment", icon: "vehicle", permission: "tyre.view" },
    { to: "/incidents", label: "Incidents", icon: "alert", permission: "incident.view" },
    { to: "/inventory", label: "Inventory & Procurement", icon: "wrench", permission: "inventory.view" },
    { to: "/preventive-maintenance", label: "PM Planning", icon: "calendar", permission: "pm.view" },
    { to: "/operational-alerts", label: "Operational Alerts", icon: "bell", permission: "alert.view" },
    { to: "/telemetry", label: "GPS & Telemetry", icon: "route", permission: "telemetry.view" }
  ]},
  { label: "Control & intelligence", links: [
    { to: "/routes-geofences", label: "Routes & Geofences", icon: "route", permission: "geofence.view" },
    { to: "/driver-safety", label: "Driver Safety", icon: "shield", permission: "safety.view" },
    { to: "/vendors", label: "Vendors & Suppliers", icon: "users", permission: "vendor.view" },
    { to: "/lifecycle", label: "Lifecycle & TCO", icon: "gauge", permission: "lifecycle.view" },
    { to: "/notifications", label: "Notification Delivery", icon: "bell", permission: "notification.view" }
  ]},
  { label: "Administration", links: [
    { to: "/settings", label: "Organization Settings", icon: "shield", permission: "dashboard.view" },
    { to: "/users", label: "Users & Access", icon: "users", permission: "user.view" },
    { to: "/branches", label: "Branches", icon: "branch", permission: "branch.view" },
    { to: "/departments", label: "Departments", icon: "department", permission: "department.view" },
    { to: "/audit", label: "Audit Trail", icon: "audit", permission: "audit.view" }
  ]}
];

const driverLinks: DriverLink[] = [
  { to: "/", label: "Driver Home", icon: "command" },
  { to: "/assignments", label: "My Vehicle", icon: "vehicle" },
  { to: "/trips", label: "My Trips", icon: "trip" },
  { to: "/inspections", label: "Inspections", icon: "inspection" },
  { to: "/fuel", label: "My Fuel", icon: "gauge" },
  { to: "/incidents", label: "Report Incident", icon: "alert" },
  { to: "/my-safety", label: "My Safety", icon: "shield" },
  { to: "/my-profile", label: "My Profile", icon: "profile" }
];

const pageTitles: Record<string, { eyebrow: string; title: string }> = {
  "/": { eyebrow: "ACRILAND LTD / OPERATIONS", title: "Fleet Command Centre" },
  "/action-centre": { eyebrow: "MANAGEMENT / DECISIONS", title: "Fleet Action Centre" },
  "/vehicles": { eyebrow: "FLEET CONTROL / ASSET REGISTER", title: "Vehicle Operations" },
  "/drivers": { eyebrow: "PEOPLE / DRIVER READINESS", title: "Driver Operations" },
  "/assignments": { eyebrow: "CONTROL / ACCOUNTABILITY", title: "Vehicle Assignments" },
  "/trips": { eyebrow: "MOVEMENT / AUTHORIZATION", title: "Trip Control" },
  "/dispatch": { eyebrow: "MOVEMENT / DISPATCH", title: "Dispatch Control" },
  "/inspections": { eyebrow: "SAFETY / ROADWORTHINESS", title: "Vehicle Inspections" },
  "/maintenance": { eyebrow: "FLEET HEALTH / WORKSHOP", title: "Maintenance & Workshop" },
  "/fuel": { eyebrow: "FLEET HEALTH / FUEL GOVERNANCE", title: "Fuel Control" },
  "/compliance": { eyebrow: "FLEET HEALTH / RISK", title: "Alerts & Compliance" },
  "/reports": { eyebrow: "MANAGEMENT / ANALYTICS", title: "Fleet Reports" },
  "/tyres": { eyebrow: "ADVANCED OPERATIONS / TYRE CONTROL", title: "Tyres & Fitment" },
  "/incidents": { eyebrow: "SAFETY / INCIDENT RESPONSE", title: "Incidents & Accidents" },
  "/inventory": { eyebrow: "WORKSHOP STORES / PROCUREMENT", title: "Inventory & Procurement" },
  "/preventive-maintenance": { eyebrow: "FLEET HEALTH / PREVENTION", title: "Preventive Maintenance" },
  "/operational-alerts": { eyebrow: "OPERATIONS / ESCALATION", title: "Operational Alerts" },
  "/telemetry": { eyebrow: "CONNECTED FLEET / TELEMETRY", title: "GPS & Telemetry" },
  "/routes-geofences": { eyebrow: "CONNECTED FLEET / ROUTE GOVERNANCE", title: "Routes & Geofences" },
  "/driver-safety": { eyebrow: "PEOPLE / SAFETY INTELLIGENCE", title: "Driver Safety & Scoring" },
  "/vendors": { eyebrow: "SUPPLY CHAIN / MASTER DATA", title: "Vendors & Suppliers" },
  "/lifecycle": { eyebrow: "FINANCE / ASSET LIFECYCLE", title: "Lifecycle, TCO & Disposal" },
  "/notifications": { eyebrow: "ESCALATION / DELIVERY", title: "Notification Delivery" },
  "/settings": { eyebrow: "ADMINISTRATION / ORGANIZATION", title: "Organization Settings" },
  "/users": { eyebrow: "ADMINISTRATION / ACCESS", title: "Users & Permissions" },
  "/branches": { eyebrow: "ADMINISTRATION / STRUCTURE", title: "Branches" },
  "/departments": { eyebrow: "ADMINISTRATION / STRUCTURE", title: "Departments" },
  "/audit": { eyebrow: "SECURITY / GOVERNANCE", title: "Audit Trail" },
  "/my-profile": { eyebrow: "DRIVER / ACCOUNT", title: "My Profile" },
  "/my-safety": { eyebrow: "DRIVER / SAFETY", title: "My Safety Score" }
};

export function Shell() {
  const { me, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const isDriver = me?.roles.includes("DRIVER") ?? false;
  const current = pageTitles[location.pathname] ?? (location.pathname.startsWith("/vehicles/") ? { eyebrow: "FLEET CONTROL / VEHICLE 360", title: "Vehicle 360" } : location.pathname.startsWith("/drivers/") ? { eyebrow: "PEOPLE / DRIVER 360", title: "Driver 360" } : { eyebrow: "ACRILAND LTD", title: "Fleet Command" });
  const initials = useMemo(() => (me?.fullName ?? "User").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""), [me?.fullName]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setSearchOpen(true);}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);

  return <div className="app-shell-v2">
    {searchOpen && !isDriver && <SearchPalette onClose={() => setSearchOpen(false)} />}
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar-v2 ${mobileOpen ? "is-open" : ""}`}>
      <div className="sidebar-brand-row">
        <div className="brand-v2"><div className="brand-mark-v2">A</div><div><b>ACRILAND</b><span>Fleet Command Centre</span></div></div>
        <button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><Icon name="close" /></button>
      </div>
      <div className="sidebar-context"><span className="context-dot" /><div><b>{isDriver ? "Driver workspace" : "Operations workspace"}</b><span>{me?.branch?.name ?? "All authorized branches"}</span></div></div>
      <nav className="sidebar-nav-v2">
        {isDriver ? <div className="nav-group-v2"><span className="nav-group-title">My operations</span>{driverLinks.map((item) => <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => isActive ? "nav-link-v2 active" : "nav-link-v2"}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</div> : managementGroups.map((group) => {
          const available = group.links.filter((item) => me?.permissions.includes(item.permission));
          if (!available.length) return null;
          return <div className="nav-group-v2" key={group.label}><span className="nav-group-title">{group.label}</span>{available.map((item) => <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => isActive ? "nav-link-v2 active" : "nav-link-v2"}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</div>;
        })}
      </nav>
      <div className="sidebar-security"><Icon name="shield" /><div><b>Protected operations</b><span>Role-based access · audited actions</span></div></div>
      <div className="sidebar-user-v2"><div className="user-avatar-v2">{initials || "U"}</div><div className="user-copy-v2"><b>{me?.fullName}</b><span>{me?.roles.join(" · ")}</span></div><button className="icon-button-v2 inverse" aria-label="Sign out" onClick={() => void logout()}><Icon name="logout" size={17} /></button></div>
    </aside>
    <main className="app-main-v2">
      <header className="topbar-v2"><div className="topbar-left-v2"><button className="mobile-nav-toggle" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu" /></button><div><span className="topbar-eyebrow">{current.eyebrow}</span><h1>{isDriver && location.pathname === "/" ? "Driver Operations" : current.title}</h1></div></div><div className="topbar-actions-v2">{!isDriver&&<button className="command-search-trigger" aria-label="Search fleet command" onClick={()=>setSearchOpen(true)}><Icon name="search" size={16}/><span>Search fleet…</span><kbd>Ctrl K</kbd></button>}<NavLink className="icon-button-v2 notification-button" aria-label="Operational alerts" to={isDriver?"/":"/operational-alerts"}><Icon name="bell" size={17} /><span /></NavLink><div className="topbar-user-v2"><div className="user-avatar-v2 light">{initials || "U"}</div><div><b>{me?.fullName}</b><span>{me?.department?.name ?? me?.roles[0] ?? "Authorized user"}</span></div></div></div></header>
      <div className="page-v2"><Outlet /></div>
    </main>
  </div>;
}
