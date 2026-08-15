import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../api/client";
import { DriverAvatar } from "../components/DriverAvatar";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth/AuthContext";

type Driver = {
  id: string;
  employeeNumber: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  licenceNumber: string;
  licenceClass: string;
  licenceExpiry: string;
  status: string;
  photoAvailable: boolean;
  photoEndpoint?: string | null;
  branch?: { name: string } | null;
  department?: { name: string } | null;
  user?: { status: string; email?: string } | null;
};

const driverFilters = [["ALL", "All drivers"], ["ACTIVE", "Active"], ["LICENCE_WATCH", "Licence watch"], ["UNAVAILABLE", "Unavailable"]] as const;
function daysUntil(value: string) { return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000); }

export function DriversPage() {
  const { me } = useAuth();
  const [items, setItems] = useState<Driver[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Driver | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);

  const load = async () => { setLoading(true); try { const result = await api<{ items: Driver[] }>("/drivers?limit=100"); setItems(result.items); if (selected) setSelected(result.items.find((item) => item.id === selected.id) ?? null); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load driver register."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => items.filter((driver) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || [driver.fullName, driver.employeeNumber, driver.licenceNumber, driver.phone ?? "", driver.email ?? ""].some((value) => value.toLowerCase().includes(q));
    const days = daysUntil(driver.licenceExpiry);
    const matchesFilter = filter === "ALL" || (filter === "ACTIVE" ? driver.status === "ACTIVE" : filter === "LICENCE_WATCH" ? days <= 90 : filter === "UNAVAILABLE" ? driver.status !== "ACTIVE" : true);
    return matchesQuery && matchesFilter;
  }), [items, query, filter]);

  const stats = useMemo(() => ({
    active: items.filter((driver) => driver.status === "ACTIVE").length,
    licenceWatch: items.filter((driver) => daysUntil(driver.licenceExpiry) <= 90).length,
    portal: items.filter((driver) => Boolean(driver.user)).length,
    unavailable: items.filter((driver) => driver.status !== "ACTIVE").length
  }), [items]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const f = new FormData(form); const portal = f.get("createPortalAccount") === "on"; setError("");
    try {
      const created = await api<Driver>("/drivers", { method: "POST", body: JSON.stringify({ employeeNumber: f.get("employeeNumber"), fullName: f.get("fullName"), phone: f.get("phone") || undefined, email: f.get("email") || undefined, licenceNumber: f.get("licenceNumber"), licenceClass: f.get("licenceClass"), licenceExpiry: f.get("licenceExpiry"), createPortalAccount: portal, temporaryPassword: f.get("temporaryPassword") || undefined }) });
      const photo = f.get("photo"); if (photo instanceof File && photo.size > 0) { const upload = new FormData(); upload.append("photo", photo); try { await api(`/drivers/${created.id}/photo`, { method: "POST", body: upload }); } catch (e) { setError(`Driver created, but the profile photo could not be uploaded: ${e instanceof Error ? e.message : "upload failed"}`); } }
      form.reset(); setShowCreate(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create driver"); }
  };

  const replacePhoto = async (driver: Driver, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; setPhotoBusy(driver.id); setError(""); const body = new FormData(); body.append("photo", file);
    try { await api(`/drivers/${driver.id}/photo`, { method: "POST", body }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update profile photo."); }
    finally { setPhotoBusy(null); event.target.value = ""; }
  };

  return <>
    <section className="page-hero-v2 compact-hero-v2"><div><span className="eyebrow-v2">AUTHORIZED OPERATORS · READINESS CONTROL</span><h2>Driver Operations</h2><p>Manage driver identity, licence validity, portal access and accountable readiness without allowing public self-registration.</p></div>{me?.permissions.includes("driver.create") && <button className="button-v2 primary" onClick={() => setShowCreate((value) => !value)}><Icon name={showCreate ? "close" : "plus"} size={16} />{showCreate ? "Close form" : "Register driver"}</button>}</section>

    {error && <div className="error-box">{error}</div>}

    <div className="mini-kpi-grid-v2 four-v2"><div><span>Registered drivers</span><b>{items.length}</b><small>Fleet operator master records</small></div><div className="good"><span>Active & available</span><b>{stats.active}</b><small>Current driver status ACTIVE</small></div><div className="warning"><span>Licence watch</span><b>{stats.licenceWatch}</b><small>Expired or within 90 days</small></div><div className="info"><span>Portal coverage</span><b>{stats.portal}</b><small>Manager-provisioned accounts</small></div></div>

    {showCreate && <form className="panel-v2 create-panel-v2" onSubmit={submit}><div className="panel-head-v2"><div><span className="panel-kicker">NEW AUTHORIZED OPERATOR</span><h3>Register driver</h3><p>The driver record is created by management. Portal access is optional and cannot be self-created.</p></div></div><div className="panel-body-v2 form-grid-v2">
      <label>Employee number<input name="employeeNumber" required /></label><label>Full name<input name="fullName" required /></label><label>Phone<input name="phone" /></label><label>Email<input name="email" type="email" /></label>
      <label>Licence number<input name="licenceNumber" required /></label><label>Licence class<input name="licenceClass" required /></label><label>Licence expiry<input name="licenceExpiry" type="date" required /></label>
      {me?.permissions.includes("driver.photo.manage") && <label>Profile photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>}
      {me?.permissions.includes("user.create_driver") && <><label className="check-v2"><input name="createPortalAccount" type="checkbox" /> Create secure driver portal account</label><label>Temporary password<input name="temporaryPassword" type="password" minLength={12} autoComplete="new-password" /></label></>}
      <div className="form-actions-v2"><button className="button-v2 primary" type="submit"><Icon name="plus" size={16} /> Create driver</button><button className="button-v2 secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</button></div>
    </div></form>}

    <div className="manager-control-note-v2"><Icon name="shield" /><div><b>Controlled driver access</b><span>Drivers cannot self-register. Authorized management provisions portal access, and first login requires a password change. Drivers may maintain only their own profile photo.</span></div></div>

    <section className="panel-v2">
      <div className="fleet-toolbar-v2"><div className="fleet-search-v2"><Icon name="search" size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search driver, employee no., licence, phone or email" /></div><div className="filter-tabs-v2">{driverFilters.map(([value, label]) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
      <div className={`fleet-register-layout-v2 ${selected ? "with-detail" : ""}`}>
        <div className="table-wrap fleet-table-v2"><table><thead><tr><th>Driver</th><th>Employee</th><th>Licence</th><th>Expiry</th><th>Status</th><th>Portal</th><th /></tr></thead><tbody>{loading ? <tr><td colSpan={7}><div className="empty-state-v2"><span className="loading-ring small" /><b>Loading driver readiness…</b></div></td></tr> : visible.length ? visible.map((driver) => {
          const days = daysUntil(driver.licenceExpiry); const expiryTone = days < 0 ? "danger" : days <= 30 ? "danger" : days <= 90 ? "warning" : "good";
          return <tr key={driver.id} className={selected?.id === driver.id ? "selected-row" : ""}><td><div className="driver-cell-v2"><DriverAvatar name={driver.fullName} photoEndpoint={driver.photoEndpoint ?? null} size="small" /><div><b>{driver.fullName}</b><span>{driver.phone || driver.email || "No contact recorded"}</span></div></div></td><td><b className="secondary-id-v2">{driver.employeeNumber}</b><span className="cell-sub-v2">{driver.branch?.name ?? "No branch"}</span></td><td><b>{driver.licenceNumber}</b><span className="cell-sub-v2">Class {driver.licenceClass}</span></td><td><span className={`expiry-v2 ${expiryTone}`}>{new Date(driver.licenceExpiry).toLocaleDateString()}</span><span className="cell-sub-v2">{days < 0 ? `${Math.abs(days)} days expired` : `${days} days remaining`}</span></td><td><span className={`status-pill-v2 driver-${driver.status}`}><i />{driver.status.replaceAll("_", " ")}</span></td><td>{driver.user ? <span className={`status-pill-v2 portal-${driver.user.status}`}><i />{driver.user.status}</span> : <span className="muted-v2">No account</span>}</td><td><button className="table-detail-button" onClick={() => setSelected(driver)}>View</button></td></tr>;
        }) : <tr><td colSpan={7}><div className="empty-state-v2"><Icon name="search" size={24} /><b>No drivers match this view</b><span>Change the search or readiness filter.</span></div></td></tr>}</tbody></table></div>

        {selected && <aside className="vehicle-detail-v2 driver-detail-v2"><div className="detail-head-v2"><DriverAvatar name={selected.fullName} photoEndpoint={selected.photoEndpoint ?? null} size="medium" /><div><span>AUTHORIZED DRIVER</span><h3>{selected.fullName}</h3><p>{selected.employeeNumber}</p></div><button onClick={() => setSelected(null)} aria-label="Close driver detail"><Icon name="close" size={17} /></button></div>
          <div className="detail-status-v2"><span className={`status-pill-v2 driver-${selected.status}`}><i />{selected.status.replaceAll("_", " ")}</span><small>{daysUntil(selected.licenceExpiry) < 0 ? "Licence expired — operation blocked" : `Licence ${daysUntil(selected.licenceExpiry)} days remaining`}</small></div>
          <div className="detail-grid-v2"><div><span>Licence number</span><b>{selected.licenceNumber}</b></div><div><span>Class</span><b>{selected.licenceClass}</b></div><div><span>Expiry</span><b>{new Date(selected.licenceExpiry).toLocaleDateString()}</b></div><div><span>Portal access</span><b>{selected.user?.status ?? "No account"}</b></div><div><span>Phone</span><b>{selected.phone || "—"}</b></div><div><span>Email</span><b>{selected.email || "—"}</b></div><div><span>Branch</span><b>{selected.branch?.name || "—"}</b></div><div><span>Department</span><b>{selected.department?.name || "—"}</b></div></div>
          {me?.permissions.includes("driver.photo.manage") && <label className={`button-v2 secondary upload-button-v2 ${photoBusy === selected.id ? "disabled" : ""}`}><Icon name="profile" size={15} />{photoBusy === selected.id ? "Uploading…" : "Replace profile photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void replacePhoto(selected, e)} disabled={photoBusy === selected.id} /></label>}
        </aside>}
      </div>
    </section>
  </>;
}
